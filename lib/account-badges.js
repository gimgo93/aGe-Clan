// Presentation badge only. Account IDs come from verified Google login sessions.
export function hasAdminBadge(accountId,env={}){
 if(typeof accountId!=='string'||!/^[a-f0-9]{64}$/.test(accountId))return false;
 if(typeof env?.CLAN_ADMIN_ACCOUNT_IDS!=='string')return false;
 return env.CLAN_ADMIN_ACCOUNT_IDS.split(/[\s,]+/).includes(accountId);
}
