# Intermediate selection operator notes

Canonical root: C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구.
Latest request: configure a middle-tier PPO seed/model and adopt only if behavior varies. Read AGENTS.md.

- Work: work/ppo-intermediate-v1. Original expanded-demo-v2 engine and running comparison are untouched.
- Fast legality adapter only in new engine: 262441 action comparisons passed over1517 states including680synthetic variants. Paired original/new full episode Python459999:2953steps,45cleared,all observations/masks/rewards/info identical. Proof JSONs in work folder.
- Stage1 ppo_intermediate_select.py:15frozen PPO snapshots seeds47/48 flat/hierarchy. Development460000..4. Chose hierarchy47/65536. Confirmation470000..19:mean38.1 median38.5 range23..44,inband4/20; diversity15/20 combined categories/towers sofail. No adoption.
- Stage2 ppo_intermediate_fallback.py:flat47 BC4000 parent, LR3e-5vs1e-4,each16384PPOsteps;8snapshots. Development480000..4 selectedLR3e-5/16384. Confirmation490000..19:mean32.05 median32.5 range19..42,inband3/20,diversityall20pass. No adoption dueperformance.
- Stage3 ppo_intermediate_capacity.py:strong hierarchy47 final131072 parent,capacity6/8/10/12screen520000..4. ChoseAIcastlecap6;training+16384LR3e-5. Other actions/rewards/waves unchanged. Wrappercapacity_env.py masksupgradeCastleatcap;enforcesinstep;everyevaluatedstatechecksmaxcastle. Development540000..4select4snapshots;confirmation550000..19. Currently running: inspect capacity.log, investment-budget/* rather than restarting.
- Main background expanded comparison ppo_expanded_train.py still running separately. Do not terminate.
- After capacity final JSON exists, queued PowerShell session67178 runs ppo_intermediate_report.py. This freezes best candidate by developmental rank, gates adoption using both criteria, writes outputs/ppo_intermediate_policy and report/registry. It replays first confirmationgame and compares action sequence plus complete outcome. Do not launch duplicate; inspect report.log and files. Packagecreationassertspreventoverwrite.
- Other sessions: stage1 13236 (complete),fallback83715 (complete),capacity9185 (running). Tool sessions may become stale; inspect native process command lines/files before restarting anything.
- No further experiments planned in this turn after stage3. Onfailure reportnoadoption andnextmediumteacherplan, do not relax80%bandcriterion.
- Outputreport: PPO_중급설정_가변성_결과보고서.md; settings:ppo_intermediate_policy/config.json; registry:PPO_난이도정책_등록부.json.
- Final Korean answer must explain whyseed47maintained,parent/LR/steps,actualperformance/variability,adoptionstatus,exactcanonicalpathsandinteractions. Linkdeliverablesonlyfromoutputs.

## Finished
- Stage3 confirmationmean42.95 median43 range40..46,0/20inband,combineddiversity0/20(no2towertypes),notadopted.
- Allthreeexperimentscomplete. AdditionalPPO32768(stage2)+16384(stage3)=49152interactions. 215development/screen/confirmationgames,plusmask/paired/replaychecks.
- Report67178completedexit0. Selectedreviewcandidatebydevelopmentrankisstage2flat47BC4000LR3e-5PPO16384;notadopted;registryintermediate=null.
- Bundleverify91114completedexit0:24SHA256files,actiontable/inputunits/configinference/fullreplaymatched. Sourcework/ppo_intermediate_verify_bundle.py;bundle-verification.log.
- Outputsreport/config/model/evidence/registrycomplete. Reportfootpathsfullycanonical. DoNOTrestartanything. Futureseed49/50pairedstudyisplannedonly,notstarted.
