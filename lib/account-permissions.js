// Visual badges never grant access. Empty configuration denies report access.
export function canReadAnalytics(accountId,env={}){
 return typeof accountId==='string'&&/^[a-f0-9]{64}$/.test(accountId)&&typeof env.CLAN_ANALYTICS_ACCOUNT_IDS==='string'&&env.CLAN_ANALYTICS_ACCOUNT_IDS.split(/[\s,]+/).includes(accountId);
}
