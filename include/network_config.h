#pragma once
// Simulation ONLY: public broker, no authentication/encryption.
// These are virtual cards and a simulated lock, never a real door.
namespace NetCfg {
constexpr char WIFI_SSID[] = "Wokwi-GUEST";
constexpr char WIFI_PASSWORD[] = "";
constexpr int WIFI_CHANNEL = 6; // Wokwi-GUEST: avoid scanning every channel.
constexpr char HOST[] = "test.mosquitto.org";
constexpr uint16_t PORT = 1883;
// Change this prefix for another group's copy. Not a security secret.
constexpr char BASE[] = "iot/nhom25/door8/w4-927-a61c";
constexpr uint32_t RETRY_MS = 5000;
constexpr uint32_t HEARTBEAT_MS = 1000; // Simulation clock; PC freshness remains 12s.
constexpr uint32_t COMMAND_MAX_AGE_MS = 2000;
}
