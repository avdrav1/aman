# Backlog

Nothing here is committed. The owner chooses what comes next.

## Known weaknesses in the current build

- **The Company rarely beats sensible play.** With sixteen powers it wins by holding six clients. In 2,000 games it beats the adviser bot 0.5% of the time and the random bot 2.9%. It beats the neglect bot, which never meets demands, hears grievances, or counters it, in 22% of games. It creates pressure but seldom wins.
- **Powers react only through memory.** They remember your favors and slights and reply at three either way (`docs/rules.md`, Memory). Their plans are still a fixed list of two, and they do not respond to the federation's size or to what you built near them. Reactive plans and bandwagon or balancing were the other two options considered.
- **The adviser barely plans.** It scores each action on its own. Its only plan is to focus on the four powers closest to joining (`Aman.prospects`), which it needed once there were fifteen. It ignores recruitment order beyond that. A player who follows it blindly wins about 54% of the time.
- **A season can still be a lot to take in.** With fifteen rivals an adviser game averages 9 briefing items a season (at most 16), 7 resolution events (at most 21), and 10 attention items (at most 22). `Aman.digest` now groups events of the same kind into one line and one playback step, which roughly halves the steps, and steps speed up to 1.15 s when there are many. A busy season still plays for ten seconds or more, and grouped lines hide each power's detail behind "One by one".
- **The balance is a knife edge.** Act 3 Influence of 8, 9, or 10 gives about 40%, 54%, or 63% adviser wins, and a demand cap of 5 instead of 6 adds about 30 points. The game snowballs once members bring Influence and income. Watch this after any change.
- **Some powers rarely pledge.** In adviser games the Gangetic Union (44%), Coromandel Coast (38%), and Island Compact (36%) are pledged at the end far less often than the Indus League (87%) or Western Passes Council (88%). This may be good texture or a sign their needs are too hard. See `docs/powers.md`.
- **Energy and Capital pile up.** Only three powers need Energy, and pacts and grids pay Energy every season, so an adviser game ends with well over 100 Energy. Capital runs 25 to 30 through Acts 2 and 3. Water is the scarce resource.
- **Several rogue crises can land in one season.** They resolve one after another. It happened in about 1 game in 20 in the sim.
- **Motion was tuned from screenshots.** Token flight (620 ms), floating numbers (1.9 s), and playback (1.8 s per step, 1.45 s over five steps, 1.15 s over eight) have never been judged by eye.
- **Inviting is a chore.** When every gate is open there is no decision in clicking Invite. It could happen on its own at season's end.
- **One save per browser.** The game saves itself and resumes, but there is one slot and no way to move a game between devices. A change to the shape of the state refuses older saves.
- **The analytics endpoint is open.** Anyone can post events to `/api/event`. It checks the shape and size of each batch, but a determined person could add junk. Fine for playtests; add rate limiting or a token before a wide release.
- **The north of the map is dense.** Western Passes, Indus, Yamuna, Aravalli, and Gangetic sit within 60 px of each other. The map script pushes their nodes apart, mirrors badges away from neighbors, and places labels to avoid every node, but in Act 3 a power there can carry four pins at once, and floating numbers and Company tokens overlap during playback. On a 390 px phone the map is about 0.77 of its frame size, so badges are small even though names are enlarged.
- **Attention pins have not been tried on a real phone.** On touch, the first tap on a pin or a power that needs you shows its sentences, and a second tap or the Open button opens the dossier. Playwright's touch emulation passes; a thumb has not tried it.
- **Weather motion has not been judged by eye.** Clouds cross the map in 40 to 70 seconds, fog drifts on a 22-second swing, and spring heat rises every 3 seconds. All were set from still screenshots. The parched-ground crack pattern is a repeating tile and may read as mechanical.
- **Terrain marks are dense in dark mode** over the Deccan, where the Ghats, Satpura, and Vindhya ranges meet. They sit under the glows and pins but add texture behind the arrows.
- **Scene motion has not been judged by eye.** The signing seal drops in 560 ms after the 620 ms token flight, the glow pulses for 1.5 s, council seats light 320 ms apart, and the ending chart draws in 2.4 s with ratification seals stamping 380 ms apart. All were set from screenshots.
- **Joins and pledges stamp only right after you act.** Neither can happen during resolution, so the season playback never shows a signing. A rejoin stamps the same as a first join.
- **The council result is a new stop.** After you choose, the chamber lights its votes and waits for Continue before the season playback. It adds a click per council item; Act 2 can hold three items in one season.
- **Sparkline lines mean different things.** The dashed line on a chip is the trust that matters next: joining (55) outside, seceding (40) for a member in Acts 1 and 2, pledging (65) or keeping a pledge (62) in Act 3. The chip's tooltip names it, but players may read every dashed line as the join line.
- **The campaign chart is busy.** Fifteen lines crowd between 40 and 80 trust once most powers are members. Lines are thin and grey outside, thick and colored inside, and pointing at a name brings one forward, but at a glance the chart shows the shape of the campaign more than any one power. Markers overlap when two powers have events at the same trust in the same season.
- **Dispute portraits only tilt toward each other.** The faces are drawn front-on, so "facing" is a lean, not a profile.
- **The realistic map needs the regional review.** The land shape and seat cities come from Natural Earth. Territory glows are small circles around each seat so they do not trace present-day countries, but the framing as a whole has not been reviewed by people from across the region.
- **Friendly ties show on the map only for the selected power,** to cut clutter. This may hide useful information.
- **Leader portraits are simple line art.** The owner was told they may read as cartoonish and offered a plain emblem instead. He has not said. There are now fifteen, told apart by hair shape, glasses, and color; at chamber size (26 to 34 px) several look alike, so the chamber names its seats.
- **Fifteen colors are not fifteen distinct colors.** The hues are spread evenly with three lightness steps, so neighbors differ, but some pairs (the greens, the blues) are close. Color is never the only cue: names sit beside every swatch.
- **The map shows only the Kaveri's state, not who takes it.** The Kaveri's width is the Coromandel Coast's water need. The tension with you is carried by the pact and plan text, not the map.
- **Difficulty has swung between rounds.** The owner found joining "fairly hard" early on, before each need showed what raises it. Watch for this after any balance change.

## Proposed and not yet built

From "how might we make the game more strategic":

- **A Company with a budget, income from arms sales, and goals,** so the player can attack its revenue and it can respond, including by bribing a member's vote.
- **Exclusive choices:** a cap on pacts, charter branches that lock out content, a choice of home power.
- **A map that matters mechanically:** effects carried downstream, aid routes that rogues can cut, neighbors mattering more than distant powers.
- **Politics inside each power:** moderates and hardliners, elections that flip needs, splinter factions.
- **Demanding members:** members proposing their own council motions and claiming a share of the budget.

From "how might we make it more visual":

- **A visual calendar** replacing the season bars, showing monsoons, votes, plan landings, and research.
- **Decision scenes for crises:** the rogue-power crisis is still a text dialog. It could be a scene like disputes. The battle itself now plays on the map.
- **Action cards** dragged onto the map in place of buttons.
- **A richer map:** cities that grow, trade ships.
- **A playable replay:** the ending chart is static. Scrubbing it could replay the map season by season from `S.history`, which would need relations and needs recorded too.

From the original design:

- **The real-time battle layer.** A greybox was built and playtested, then replaced by a three-round battle on the map. See `docs/battle.md`. Not built: the dispute-sabotage trigger, carry-over of resources, and common defense as a squad.
- **All four rogue types** and conquest as a costly option.
- **A choice of which power to play.** The sixteen powers are built; the player is always the Deccan Compact.

## Open design questions

- Can a rogue power be right? Does the game admit it when the player's federation caused a breakaway?
- What makes each of the sixteen play differently beyond its numbers? Today they differ only in needs, pacts, plans, motions, and neighbors.
- Is the Company playable?
- What engine for the full game? The owner has used Godot 4 for other games. The prototype's `engine.js` was written to be portable: it has no DOM and no dependencies.
