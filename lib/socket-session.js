// A socket caches no bearer token. Recheck the hashed login session at most
// every five seconds, before commands/heartbeats, and never beyond its expiry.
export async function validateSocketSession(db,auth,now=Date.now()){
 if(!auth)return;
 if(!/^[a-f0-9]{64}$/.test(auth.sessionKey||'')||!/^[a-f0-9]{64}$/.test(auth.accountId||'')||!Number.isSafeInteger(auth.expires))throw Object.assign(Error('로그인 연결을 확인할 수 없습니다.'),{status:401});
 if(now>=auth.expires)throw Object.assign(Error('로그인 세션이 만료되었습니다. 다시 로그인하세요.'),{status:401});
 if(auth.checkedAt&&now-auth.checkedAt<5000)return;
 const row=await db.prepare('SELECT account_id,expires FROM clan_account_sessions WHERE id=? AND expires>?').bind(auth.sessionKey,now).first();
 if(!row||row.account_id!==auth.accountId)throw Object.assign(Error('로그인 연결이 종료되었습니다. 다시 로그인하세요.'),{status:401});
 auth.expires=row.expires;auth.checkedAt=now;
}
