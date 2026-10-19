// Only one participant drives the HTTP simulation. Other participants read
// committed snapshots and persist their heartbeat every five seconds.
export function canReadSnapshot(room, player, updated, now) {
  if (now - player.seen >= 5000) return false;
  if (room.status === 'countdown') return now < room.readyAt;
  if (room.status !== 'playing') return true;
  if (now - updated < 250) return true;
  const driver = room.players.find(p => p.id === room.httpDriver && !p.left && !p.s.over);
  return driver && driver.id !== player.id && now - driver.seen < 4000 && now - updated < 2000;
}

export function claimHttpDriver(room, player, now) {
  const driver = room.players.find(p => p.id === room.httpDriver && !p.left && !p.s.over);
  if (!driver || now - driver.seen >= 4000 || now - room.tick >= 2000) room.httpDriver = player.id;
}

export function timedDatabase(database, metrics) {
  function wrap(statement) {
    const execute = async (method, args) => {
      const began = performance.now(); metrics.queries++;
      try { return await statement[method](...args); }
      finally { metrics.storageMs += performance.now() - began; }
    };
    return {
      bind: (...args) => wrap(statement.bind(...args)),
      first: (...args) => execute('first', args),
      run: (...args) => execute('run', args),
    };
  }
  return { prepare: sql => wrap(database.prepare(sql)) };
}
