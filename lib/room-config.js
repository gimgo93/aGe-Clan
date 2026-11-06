export const PLAYER_CAPACITY=4;
export const FRONTIERS=Object.freeze(['west','south','north','east']);

// Never evict a participant from a room that was created before the capacity
// change. Only already persisted five-player rooms retain the old limit.
export function roomCapacity(room){
 if(room.solo)return 1;
 if(room.capacity===4||room.capacity===5)return room.capacity;
 return room.players.length>PLAYER_CAPACITY?5:PLAYER_CAPACITY;
}
export function ensureRoomCapacity(room){return room.capacity=roomCapacity(room);}

export function assignFrontiers(room){
 ensureRoomCapacity(room);
 if(room.solo){for(const p of room.players)p.frontier='central';return;}
 const used=new Set(room.players.map(p=>p.frontier).filter(id=>FRONTIERS.includes(id)));
 for(const p of room.players){
  if(FRONTIERS.includes(p.frontier)||p.frontier==='central')continue;
  const id=FRONTIERS.find(id=>!used.has(id));
  // A grandfathered fifth participant keeps a central territory. New rooms
  // cannot reach this branch because entry is capped at four on the server.
  p.frontier=id||'central';used.add(p.frontier);
 }
}
