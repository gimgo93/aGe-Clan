// Isolated policy experiment: protect only potion spending, never alter game rules.
import {choose} from './policies.mjs';
export function blocksPotionForCastle(s,D) {
  return s.wave>=18 && s.castle<17 && s.crystals<D.castleCost(s.castle)+7;
}
export function chooseReserved(game,D,policy) {
  const reserve=policy.castlePotionReserve && blocksPotionForCastle(game.s,D);
  // Decide before choose(): blocked potions must not update lastIce/lastLightningWave.
  return choose(game,D,reserve?{...policy,potions:false}:policy);
}
