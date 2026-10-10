#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <atomic>
#include <esp_system.h>
#include "network_config.h"
#include "network_bridge.h"

namespace {
struct Packet { char suffix[12]; char body[448]; };
struct Snapshot { char state[32]; bool doorOpen; bool lockout; uint32_t loopMaxUs; uint32_t uptime; };
struct Command { char action[12]; uint32_t seq; uint32_t at; uint32_t epoch; };
QueueHandle_t outgoing = nullptr, snapshots = nullptr, commands = nullptr;
std::atomic<bool> online{false}, paused{false};
std::atomic<uint32_t> epoch{0}, dropped{0};
std::atomic<int> workerStage{0};
WiFiClient socketClient;
PubSubClient mqtt(socketClient);
char session[17] = "";
uint32_t lastSeq = 0;
char commandTopic[128], statusTopic[128], stateTopic[128];

void topic(char* out, size_t size, const char* suffix) {
  snprintf(out, size, "%s/%s", NetCfg::BASE, suffix);
}

void enqueue(const char* suffix, const JsonDocument& doc) {
  if (!outgoing || !online.load()) { dropped++; return; }
  Packet p{};
  strlcpy(p.suffix, suffix, sizeof(p.suffix));
  if (measureJson(doc) >= sizeof(p.body)) { dropped++; return; }
  serializeJson(doc, p.body, sizeof(p.body));
  if (xQueueSend(outgoing, &p, 0) != pdTRUE) dropped++;
}

void reject(const char* reason) {
  StaticJsonDocument<192> doc;
  doc["result"] = "rejected";
  doc["reason"] = reason;
  enqueue("ack", doc);
  Serial.printf("[NET] COMMAND_REJECTED %s\n", reason);
}

void callback(char* incomingTopic, byte* payload, unsigned int length) {
  if (strcmp(incomingTopic, commandTopic) != 0) return;
  if (length == 0 || length > 240) { reject("length"); return; }
  StaticJsonDocument<384> doc;
  if (deserializeJson(doc, payload, length)) { reject("json"); return; }
  if (!doc["session"].is<const char*>() ||
      !doc["seq"].is<uint32_t>() || !doc["action"].is<const char*>()) {
    reject("schema"); return;
  }
  if (strcmp(doc["session"], session) != 0) { reject("old_session"); return; }
  uint32_t seq = doc["seq"];
  if (seq == 0 || seq <= lastSeq) { reject("duplicate_or_old_seq"); return; }
  const char* action = doc["action"];
  if (strcmp(action, "unlock") && strcmp(action, "status")) { reject("action"); return; }
  Command cmd{};
  strlcpy(cmd.action, action, sizeof(cmd.action));
  cmd.seq = seq; cmd.at = millis(); cmd.epoch = epoch.load();
  if (xQueueSend(commands, &cmd, 0) != pdTRUE) { reject("busy"); return; }
  lastSeq = seq;
  Serial.printf("[NET] RX action=%s seq=%lu\n", cmd.action, static_cast<unsigned long>(seq));
}

void invalidate() {
  online = false;
  epoch++;
  if (outgoing) xQueueReset(outgoing); // Week 4 does not replay offline history.
  if (commands) xQueueReset(commands);
}

void worker(void*) {
  workerStage = 1;
  WiFi.mode(WIFI_STA);
  workerStage = 2;
  WiFi.begin(NetCfg::WIFI_SSID, NetCfg::WIFI_PASSWORD);
  workerStage = 3;
  Serial.println("[NET] WiFi started; waiting for IP");
  mqtt.setServer(NetCfg::HOST, NetCfg::PORT);
  mqtt.setCallback(callback);
  if (!mqtt.setBufferSize(768)) { Serial.println("[NET] MQTT buffer allocation failed"); vTaskDelete(nullptr); return; }
  mqtt.setSocketTimeout(2);
  mqtt.setKeepAlive(15);
  topic(commandTopic, sizeof(commandTopic), "cmd");
  topic(statusTopic, sizeof(statusTopic), "availability");
  topic(stateTopic, sizeof(stateTopic), "state");
  uint32_t attemptAt = millis() - NetCfg::RETRY_MS;
  uint32_t wifiAttemptAt = millis();
  uint32_t publishedAt = millis() - NetCfg::HEARTBEAT_MS;
  Snapshot latest{};
  bool haveSnapshot = false, wasPaused = false;
  for (;;) {
    uint32_t now = millis();
    if (paused.load()) {
      if (!wasPaused) {
        invalidate();
        if (mqtt.connected()) mqtt.publish(statusTopic, "offline", true);
        mqtt.disconnect(); socketClient.stop();
        WiFi.disconnect();
        wasPaused = true;
        Serial.println("[NET] Paused by local test command");
      }
      vTaskDelay(pdMS_TO_TICKS(20)); continue;
    }
    if (wasPaused) {
      WiFi.begin(NetCfg::WIFI_SSID, NetCfg::WIFI_PASSWORD);
      wifiAttemptAt = now;
      attemptAt = now - NetCfg::RETRY_MS;
      wasPaused = false;
    }
    if (WiFi.status() != WL_CONNECTED) {
      if (online.load()) { invalidate(); socketClient.stop(); Serial.println("[NET] WiFi lost"); }
      if (now - wifiAttemptAt >= NetCfg::RETRY_MS) { wifiAttemptAt = now; WiFi.reconnect(); }
      vTaskDelay(pdMS_TO_TICKS(20)); continue;
    }
    if (!mqtt.connected()) {
      if (online.load()) { invalidate(); Serial.println("[NET] MQTT lost"); }
      if (now - attemptAt >= NetCfg::RETRY_MS) {
        attemptAt = now;
        char clientId[48];
        snprintf(clientId, sizeof(clientId), "n25-door8-%08lx", static_cast<unsigned long>(esp_random()));
        snprintf(session, sizeof(session), "%08lx%08lx", static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
        lastSeq = 0;
        Serial.printf("[NET] Connecting %s:%u\n", NetCfg::HOST, NetCfg::PORT);
        // Blocking socket operations are confined to this worker, never the door loop.
        if (mqtt.connect(clientId, statusTopic, 1, true, "offline")) {
          epoch++;
          if (!mqtt.subscribe(commandTopic, 1)) { mqtt.disconnect(); continue; }
          online = true;
          mqtt.publish(statusTopic, "online", true);
          publishedAt = now - NetCfg::HEARTBEAT_MS;
          Serial.printf("[NET] CONNECTED base=%s session=%s\n", NetCfg::BASE, session);
        } else Serial.printf("[NET] CONNECT_FAILED rc=%d\n", mqtt.state());
      }
      vTaskDelay(pdMS_TO_TICKS(20)); continue;
    }
    mqtt.loop();
    if (!mqtt.connected()) { vTaskDelay(pdMS_TO_TICKS(10)); continue; }
    bool changed = false;
    Snapshot incoming{};
    if (xQueueReceive(snapshots, &incoming, 0) == pdTRUE) {
      changed = !haveSnapshot || strcmp(incoming.state, latest.state) ||
                incoming.doorOpen != latest.doorOpen || incoming.lockout != latest.lockout;
      latest = incoming; haveSnapshot = true;
    }
    if (haveSnapshot && (changed || now - publishedAt >= NetCfg::HEARTBEAT_MS)) {
      StaticJsonDocument<448> doc;
      doc["state"] = latest.state;
      doc["door"] = latest.doorOpen ? "OPEN" : "CLOSED";
      doc["lockout"] = latest.lockout;
      doc["uptime_ms"] = latest.uptime;
      doc["loop_max_us"] = latest.loopMaxUs;
      doc["session"] = session;
      doc["dropped"] = dropped.load();
      char body[448]; serializeJson(doc, body, sizeof(body));
      if (mqtt.publish(stateTopic, body, true)) publishedAt = now;
    }
    Packet p{};
    if (xQueueReceive(outgoing, &p, 0) == pdTRUE) {
      char name[128]; topic(name, sizeof(name), p.suffix);
      if (!mqtt.publish(name, p.body, false)) dropped++;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
} // namespace

void networkBegin() {
  outgoing = xQueueCreate(16, sizeof(Packet));
  snapshots = xQueueCreate(1, sizeof(Snapshot));
  commands = xQueueCreate(8, sizeof(Command));
  if (!outgoing || !snapshots || !commands) { Serial.println("[NET] Queue allocation failed; local mode only"); return; }
  if (xTaskCreatePinnedToCore(worker, "mqtt-worker", 8192, nullptr, 1, nullptr, 0) != pdPASS)
    Serial.println("[NET] Task creation failed; local mode only");
}

void networkEvent(const char* event, const char* state, const char* detail) {
  StaticJsonDocument<384> doc;
  doc["evt"] = event; doc["state"] = state;
  doc["detail"] = detail; doc["uptime_ms"] = millis();
  enqueue("event", doc);
}

void networkSnapshot(const char* state, bool doorOpen, bool lockout, uint32_t loopMaxUs) {
  if (!snapshots) return;
  Snapshot s{}; strlcpy(s.state, state, sizeof(s.state));
  s.doorOpen = doorOpen; s.lockout = lockout; s.loopMaxUs = loopMaxUs; s.uptime = millis();
  xQueueOverwrite(snapshots, &s);
}

bool networkCommand(char* action, size_t capacity, uint32_t& sequence) {
  if (!commands) return false;
  Command c{};
  if (xQueueReceive(commands, &c, 0) != pdTRUE) return false;
  if (!online.load() || c.epoch != epoch.load() || millis() - c.at > NetCfg::COMMAND_MAX_AGE_MS) {
    networkAck(c.seq, "expired", "UNCHANGED"); return false;
  }
  strlcpy(action, c.action, capacity); sequence = c.seq;
  return true;
}

void networkAck(uint32_t sequence, const char* result, const char* state) {
  StaticJsonDocument<256> doc;
  doc["seq"] = sequence; doc["result"] = result;
  doc["state"] = state; doc["uptime_ms"] = millis();
  enqueue("ack", doc);
}

bool networkIsOnline() { return online.load(); }
void networkReport() {
  Serial.printf("[NET] stage=%d wifi_status=%d ip=%s mqtt=%s\n", workerStage.load(),
                static_cast<int>(WiFi.status()), WiFi.localIP().toString().c_str(), online.load() ? "online" : "offline");
}
void networkPauseForTest(bool value) { paused = value; }
