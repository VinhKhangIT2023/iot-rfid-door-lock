#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>
namespace AccessPolicy {
constexpr unsigned MaxCards=8;
struct Card {char uid[21];char name[49];bool enabled;uint8_t days;int16_t start,end;uint32_t validFrom,validUntil;};
struct Config {uint32_t magic;uint64_t revision;uint8_t count;Card cards[MaxCards];};
struct Decision {bool allowed;const char* reason;const Card* card;};
bool transportBegin();
void load(); // worker only: NVS and network view
const char* update(JsonVariantConst document); // nullptr on success
void writeJson(JsonDocument& document,const char* session);
bool poll(); // main loop only
Decision authorize(const char* uid,time_t now);
Decision evaluate(const Config& config,bool healthy,const char* uid,time_t now);
uint64_t revision();
bool healthy();
void selfTest(); // Serial-only, evaluates synthetic times without changing config
}
