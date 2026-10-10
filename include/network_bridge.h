#pragma once
#include <Arduino.h>
// All calls here are made by the firmware loop; only worker owns MQTT.
void networkBegin();
void networkEvent(const char* event, const char* state, const char* detail);
void networkSnapshot(const char* state, bool doorOpen, bool lockout, uint32_t loopMaxUs);
bool networkCommand(char* action, size_t capacity, uint32_t& sequence);
void networkAck(uint32_t sequence, const char* result, const char* state);
bool networkIsOnline();
void networkReport();
void networkPauseForTest(bool paused);
