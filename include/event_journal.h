#pragma once
#include <Preferences.h>
#include <cstring>

// Only the MQTT worker accesses NVS. Door/FSM never waits on flash or network.
class EventJournal {
 public:
  static constexpr unsigned Capacity = 24;
  struct Record {
    uint32_t magic;
    uint64_t order;
    uint32_t captureEpoch;
    bool history;
    char body[448];
  };
  bool begin() {
    healthy = prefs.begin("door-journal", false);
    if (!healthy) return false;
    for (unsigned i=0;i<Capacity;i++) {
      char key[8]; slotKey(i,key);
      if (!prefs.isKey(key)) continue;
      if (prefs.getBytesLength(key)!=sizeof(Record)) continue;
      Record r{};
      if (prefs.getBytes(key,&r,sizeof(r))!=sizeof(r) || r.magic!=Magic ||
          !r.order || !memchr(r.body,0,sizeof(r.body))) { healthy=false; continue; }
      rows[i]=r; used[i]=true;
      if (r.order>lastOrder) lastOrder=r.order;
      // A recovered record is always history, irrespective of its old epoch.
      recovered[i]=true;
    }
    return healthy;
  }
  bool append(const char* body,uint32_t captureEpoch,bool history) {
    if(!healthy) return false;
    if (strlen(body)>=sizeof(Record::body)) return false;
    for (unsigned i=0;i<Capacity;i++) if (!used[i]) {
      Record r{};r.magic=Magic;r.order=lastOrder+1;r.captureEpoch=captureEpoch;r.history=history;
      strcpy(r.body,body);
      char key[8];slotKey(i,key);
      if (prefs.putBytes(key,&r,sizeof(r))!=sizeof(r)) { healthy=false;return false; }
      rows[i]=r;used[i]=true;recovered[i]=false;lastOrder=r.order;return true;
    }
    return false; // Never overwrite a record which has not been acknowledged.
  }
  int head() const {
    int best=-1;
    for (unsigned i=0;i<Capacity;i++)
      if(used[i]&&(best<0||rows[i].order<rows[best].order)) best=i;
    return best;
  }
  const Record& get(int index) const { return rows[index]; }
  bool isRecovered(int index) const { return recovered[index]; }
  bool markHistory(int index) {
    if(rows[index].history) return true;
    Record r=rows[index];r.history=true;
    char key[8];slotKey(index,key);
    if(prefs.putBytes(key,&r,sizeof(r))!=sizeof(r)){healthy=false;return false;}
    rows[index]=r;return true;
  }
  bool acknowledge(int index) {
    char key[8];slotKey(index,key);
    if(!prefs.remove(key)){healthy=false;return false;}
    used[index]=false;recovered[index]=false;return true;
  }
  unsigned count() const {unsigned n=0;for(bool value:used)if(value)n++;return n;}
  bool ok() const {return healthy;}
 private:
  static constexpr uint32_t Magic=0x4a524e31;
  static void slotKey(unsigned slot,char* key){snprintf(key,8,"e%02u",slot);}
  Preferences prefs;
  Record rows[Capacity]{};
  bool used[Capacity]{},recovered[Capacity]{},healthy=false;
  uint64_t lastOrder=0;
};
