// Disposable fixture only. Never opens a configured D1 DB or accepts a DB path.
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
const temporaryRoot=realpathSync(tmpdir()),directory=mkdtempSync(join(temporaryRoot,'age-clan-restore-'));
if(dirname(resolve(directory))!==temporaryRoot||!basename(directory).startsWith('age-clan-restore-'))throw Error('Unexpected disposable fixture path');
let original,restored;
try{
 original=new DatabaseSync(join(directory,'disposable.sqlite'));
 for(const file of readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())original.exec(readFileSync('drizzle/'+file,'utf8'));
 original.prepare('INSERT INTO clan_accounts VALUES (?,?,?,?,?,?,?,?)').run('test-account','복원 확인',0,'{}','{}',1,1,1);
 original.prepare('INSERT INTO clan_account_progress VALUES (?,?,?,?,?,?,?,?,?,?)').run('test-account',20,100,5,10,30,2,8,1,1);
 const expected=original.prepare('SELECT a.name,p.wave FROM clan_accounts a JOIN clan_account_progress p ON a.id=p.id').all();
 await backup(original,join(directory,'snapshot.sqlite'));
 original.exec('DELETE FROM clan_account_progress; DELETE FROM clan_accounts;');
 assert.equal(original.prepare('SELECT COUNT(*) n FROM clan_accounts').get().n,0);
 restored=new DatabaseSync(join(directory,'snapshot.sqlite'),{readOnly:true});
 assert.deepEqual(restored.prepare('SELECT a.name,p.wave FROM clan_accounts a JOIN clan_account_progress p ON a.id=p.id').all(),expected);
 assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 console.log('PASS: disposable schema fixture backup, destructive fixture change, isolated restore and integrity check; not a production D1/DO recovery test');
}finally{restored?.close();original?.close();rmSync(directory,{recursive:true,force:true});}
