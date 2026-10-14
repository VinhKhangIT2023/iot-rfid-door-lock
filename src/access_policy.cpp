#include "access_policy.h"
#include <Preferences.h>
#include <time.h>
#include <atomic>
namespace AccessPolicy {
namespace {
constexpr uint32_t Magic=0x504f4c31;
struct Update {Config config;bool ok;};
Preferences prefs;
Config stored{},local{};
bool localOK=false;
std::atomic<bool> storageOK{false};
QueueHandle_t updates=nullptr;
portMUX_TYPE revisionMux=portMUX_INITIALIZER_UNLOCKED;
uint64_t activeRevision=0;
bool hexUid(const char* value){size_t n=strlen(value);if(n!=8&&n!=14&&n!=20)return false;for(size_t i=0;i<n;i++)if(!((value[i]>='0'&&value[i]<='9')||(value[i]>='A'&&value[i]<='F')))return false;return true;}
bool valid(const Config& config){
  if(config.magic!=Magic||config.revision>9007199254740991ULL||config.count>MaxCards)return false;
  for(unsigned i=0;i<config.count;i++){
    const auto& c=config.cards[i];
    if(!memchr(c.uid,0,sizeof(c.uid))||!hexUid(c.uid)||!memchr(c.name,0,sizeof(c.name))||!c.name[0]||c.days>127)return false;
    for(const char* p=c.name;*p;p++)if(static_cast<unsigned char>(*p)<32||*p==127)return false;
    if(!((c.start==-1&&c.end==-1)||(c.start>=0&&c.start<1440&&c.end>=0&&c.end<1440&&c.start!=c.end)))return false;
    if(c.validFrom>4102444800U||c.validUntil>4102444800U||(c.validFrom&&c.validUntil&&c.validFrom>=c.validUntil))return false;
    for(unsigned j=0;j<i;j++)if(!strcmp(c.uid,config.cards[j].uid))return false;
  }
  return true;
}
void deliver(){Update u{stored,storageOK.load()};if(updates)xQueueOverwrite(updates,&u);}
void seed(){stored={};stored.magic=Magic;stored.count=2;strcpy(stored.cards[0].uid,"01020304");strcpy(stored.cards[0].name,"blue");strcpy(stored.cards[1].uid,"11223344");strcpy(stored.cards[1].name,"green");for(unsigned i=0;i<2;i++){stored.cards[i].enabled=true;stored.cards[i].days=127;stored.cards[i].start=stored.cards[i].end=-1;}}
bool equal(const Config& a,const Config& b){
  if(a.revision!=b.revision||a.count!=b.count)return false;
  for(unsigned i=0;i<a.count;i++){const auto& x=a.cards[i];const auto& y=b.cards[i];if(strcmp(x.uid,y.uid)||strcmp(x.name,y.name)||x.enabled!=y.enabled||x.days!=y.days||x.start!=y.start||x.end!=y.end||x.validFrom!=y.validFrom||x.validUntil!=y.validUntil)return false;}return true;
}
}
bool transportBegin(){updates=xQueueCreate(1,sizeof(Update));return updates!=nullptr;}
void load(){
  seed();storageOK=prefs.begin("door-cards",false);
  if(storageOK&&prefs.isKey("config")){
    Config c{};
    if(prefs.getBytesLength("config")!=sizeof(c)||prefs.getBytes("config",&c,sizeof(c))!=sizeof(c)||!valid(c)){storageOK=false;stored.count=0;}
    else stored=c;
  }
  deliver();Serial.printf("[POLICY] NVS=%s cards=%u revision=%llu\n",storageOK?"ok":"error",stored.count,stored.revision);
}
const char* update(JsonVariantConst document){
  if(!document.is<JsonObjectConst>()||!document["revision"].is<uint64_t>()||!document["cards"].is<JsonArrayConst>())return "policy_schema";
  auto array=document["cards"].as<JsonArrayConst>();if(array.size()>MaxCards)return "card_limit";
  Config next{};next.magic=Magic;next.revision=document["revision"].as<uint64_t>();next.count=array.size();unsigned i=0;
  for(JsonObjectConst item:array){
    if(!item["uid"].is<const char*>()||!item["name"].is<const char*>()||!item["enabled"].is<bool>()||!item["days"].is<int>()||!item["start"].is<int>()||!item["end"].is<int>()||!item["valid_from"].is<uint32_t>()||!item["valid_until"].is<uint32_t>())return "card_schema";
    auto& c=next.cards[i++];const char* uid=item["uid"],*name=item["name"];
    if(strlen(uid)>=sizeof(c.uid)||strlen(name)>=sizeof(c.name)||item["days"].as<int>()<0||item["days"].as<int>()>127||item["start"].as<int>()<-1||item["start"].as<int>()>1439||item["end"].as<int>()<-1||item["end"].as<int>()>1439)return "card_schema";
    strcpy(c.uid,uid);strcpy(c.name,name);c.enabled=item["enabled"];c.days=item["days"];c.start=item["start"];c.end=item["end"];c.validFrom=item["valid_from"];c.validUntil=item["valid_until"];
  }
  if(!valid(next))return "policy_schema";
  if(next.revision<stored.revision)return "old_revision";
  if(next.revision==stored.revision){if(!equal(next,stored))return "revision_conflict";return storageOK?nullptr:"policy_storage";}
  if(prefs.putBytes("config",&next,sizeof(next))!=sizeof(next)){storageOK=false;deliver();return "policy_storage";}
  stored=next;storageOK=true;deliver();return nullptr;
}
void writeJson(JsonDocument& d,const char* session){d["session"]=session;d["revision"]=stored.revision;d["ok"]=storageOK.load();auto array=d.createNestedArray("cards");for(unsigned i=0;i<stored.count;i++){auto c=array.createNestedObject();const auto& card=stored.cards[i];c["uid"]=card.uid;c["name"]=card.name;c["enabled"]=card.enabled;c["days"]=card.days;c["start"]=card.start;c["end"]=card.end;c["valid_from"]=card.validFrom;c["valid_until"]=card.validUntil;}}
bool poll(){Update u{};if(!updates||xQueueReceive(updates,&u,0)!=pdTRUE)return false;bool changed=local.revision!=u.config.revision;local=u.config;localOK=u.ok;portENTER_CRITICAL(&revisionMux);activeRevision=local.revision;portEXIT_CRITICAL(&revisionMux);return changed;}
uint64_t revision(){portENTER_CRITICAL(&revisionMux);uint64_t r=activeRevision;portEXIT_CRITICAL(&revisionMux);return r;}
bool healthy(){return storageOK.load();}
Decision evaluate(const Config& config,bool ok,const char* uid,time_t now){
  if(!ok)return {false,"policy_unavailable",nullptr};
  const Card* card=nullptr;for(unsigned i=0;i<config.count;i++)if(!strcmp(config.cards[i].uid,uid)){card=&config.cards[i];break;}
  if(!card)return {false,"not_registered",nullptr};if(!card->enabled)return {false,"disabled",card};
  const bool timed=card->days!=127||card->start!=-1||card->validFrom||card->validUntil;
  if(timed&&now<1704067200)return {false,"clock_unavailable",card};
  if(card->validFrom&&static_cast<uint64_t>(now)<card->validFrom)return {false,"not_yet_valid",card};
  if(card->validUntil&&static_cast<uint64_t>(now)>=card->validUntil)return {false,"expired",card};
  if(timed){time_t shifted=now+7*3600;tm t{};gmtime_r(&shifted,&t);int day=(t.tm_wday+6)%7,minute=t.tm_hour*60+t.tm_min;
    if(card->start!=-1){if(card->start<card->end){if(minute<card->start||minute>=card->end)return {false,"outside_schedule",card};}else{if(minute>=card->start){}else if(minute<card->end)day=(day+6)%7;else return {false,"outside_schedule",card};}}
    if(!(card->days&(1<<day)))return {false,"outside_schedule",card};
  }
  return {true,nullptr,card};
}
Decision authorize(const char* uid,time_t now){return evaluate(local,localOK,uid,now);}
void selfTest(){
  Config c{};c.count=1;auto& r=c.cards[0];strcpy(r.uid,"01020304");r.enabled=true;r.days=127;r.start=r.end=-1;
  unsigned total=0,pass=0;auto check=[&](bool value){total++;if(value)pass++;};
  check(evaluate(c,true,r.uid,0).allowed);check(!evaluate(c,false,r.uid,0).allowed);check(!evaluate(c,true,"55667788",0).allowed);
  r.enabled=false;check(!evaluate(c,true,r.uid,1791795600).allowed);r.enabled=true;r.start=8*60;r.end=17*60;
  check(!evaluate(c,true,r.uid,0).allowed);
  // 2026-10-12 Monday, UTC+7: 08:00 and 17:00 boundaries.
  check(evaluate(c,true,r.uid,1791766800).allowed);check(!evaluate(c,true,r.uid,1791799200).allowed);
  r.start=22*60;r.end=2*60;r.days=1;
  check(evaluate(c,true,r.uid,1791826200).allowed); // Tuesday 00:30 belongs to Monday window
  check(!evaluate(c,true,r.uid,1791831600).allowed); // Tuesday 02:00 excluded
  r.start=r.end=-1;r.days=127;r.validUntil=1791826200;check(!evaluate(c,true,r.uid,1791826200).allowed);
  Serial.printf("[POLICY TEST] %u/%u passed (synthetic times; no config change)\n",pass,total);
}
}
