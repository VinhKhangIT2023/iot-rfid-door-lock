"""Week 4 simulated door console. Subscribe first; never auto-unlocks."""
import argparse
import json
import threading
import time
from datetime import datetime, timezone

class DoorConsole:
    def __init__(self):
        self.guard = threading.Lock()
        self.session = None
        self.seq = 0
        self.last_fresh_state = 0.0
        self.online = False

    def receive(self, suffix, payload, retained=False):
        with self.guard:
            if suffix == "availability":
                self.online = payload == "online"
                if not self.online:
                    self.last_fresh_state = 0.0
                return
            if suffix != "state" or retained:
                return
            try:
                obj = json.loads(payload)
                session = obj.get("session")
                if not isinstance(session, str) or len(session) != 16:
                    return
            except (ValueError, AttributeError):
                return
            if self.session != session:
                self.session, self.seq = session, 0
            self.last_fresh_state = time.monotonic()

    def command(self, action):
        if action not in ("unlock", "status"):
            raise ValueError("Only unlock or status")
        with self.guard:
            if not self.online or not self.session or time.monotonic() - self.last_fresh_state > 12:
                raise ValueError("Wait for a fresh live state (not only retained), normally <=5 seconds")
            self.seq += 1
            return json.dumps({"session": self.session, "seq": self.seq, "action": action})

def main():
    import paho.mqtt.client as mqtt
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="test.mosquitto.org")
    parser.add_argument("--port", default=1883, type=int)
    parser.add_argument("--base", default="iot/nhom25/door8/w4-927-a61c")
    parser.add_argument("--log", default="mqtt_log.jsonl")
    args = parser.parse_args()
    model = DoorConsole()
    writer_lock = threading.Lock()
    log = open(args.log, "a", encoding="utf-8")
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

    def record(direction, topic, payload, retained=False):
        row = {"time_utc": datetime.now(timezone.utc).isoformat(), "direction": direction,
               "topic": topic, "payload": payload, "retained": retained}
        with writer_lock:
            log.write(json.dumps(row, ensure_ascii=False) + "\n")
            log.flush()
        print(direction, topic, payload, flush=True)

    def connected(client, userdata, flags, reason, properties):
        print("Broker:", reason, flush=True)
        if reason == 0:
            client.subscribe(args.base + "/#", qos=1)

    def received(client, userdata, message):
        payload = message.payload.decode("utf-8", errors="replace")
        suffix = message.topic.rsplit("/", 1)[-1]
        model.receive(suffix, payload, message.retain)
        record("RX", message.topic, payload, message.retain)

    def disconnected(client, userdata, flags, reason, properties):
        model.receive("availability", "offline")
        print("Broker disconnected:", reason, flush=True)

    client.on_connect = connected
    client.on_message = received
    client.on_disconnect = disconnected
    client.reconnect_delay_set(min_delay=1, max_delay=10)
    client.connect_async(args.host, args.port, 15)
    client.loop_start()
    last_body = None
    print("SIMULATION ONLY. Commands: status, unlock, replay, raw <JSON>, quit.")
    print("Start one controller per session. replay/raw are for negative tests only.")
    try:
        while True:
            action = input().strip()
            if action in ("quit", "exit"):
                break
            try:
                if action == "replay":
                    if last_body is None:
                        raise ValueError("Send a normal command first")
                    body = last_body
                elif action.startswith("raw "):
                    body = action[4:]
                else:
                    body = model.command(action)
                    last_body = body
                info = client.publish(args.base + "/cmd", body, qos=1, retain=False)
                record("TX" if info.rc == 0 else "TX_FAILED", args.base + "/cmd", body)
            except ValueError as exc:
                print(exc)
    except (EOFError, KeyboardInterrupt):
        pass
    finally:
        client.disconnect()
        client.loop_stop()
        log.close()

if __name__ == "__main__":
    main()
