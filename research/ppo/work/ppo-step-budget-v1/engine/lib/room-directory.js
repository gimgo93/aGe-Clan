// D1 only indexes matchmaking/rejoin metadata. It is never the live simulation.
export function directoryRecord(id,room,version,now=Date.now()){
 return{id,version,updated:now,status:room.status,state:JSON.stringify({directoryOnly:true,solo:!!room.solo,private:!!room.private,players:room.players.map(p=>({key:p.key,entryId:p.entryId,left:!!p.left,s:{over:!!p.s.over}}))})};
}
export class RoomDirectory{
 constructor(db,waitUntil){this.db=db;this.waitUntil=waitUntil;this.pending=null;this.running=null;}
 enqueue(record){
  this.pending=record;
  if(this.running)return;
  this.running=this.flush().catch(e=>console.error('room directory sync',e.message)).finally(()=>{this.running=null;if(this.pending)this.enqueue(this.pending);});
  this.waitUntil(this.running);
 }
 async flush(){
  while(this.pending){const row=this.pending;this.pending=null;
   await this.db.prepare('UPDATE clan_rooms SET state=?,status=?,version=?,updated=? WHERE id=? AND version<=?').bind(row.state,row.status,row.version,row.updated,row.id,row.version).run();
  }
 }
}
