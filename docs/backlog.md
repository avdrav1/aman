# Backlog

Nothing here is committed. The owner chooses what comes next.

## Known weaknesses in the current build

- **The Company is toothless as a win condition.** In 2,000 simulated games led by the adviser it never ended the game by holding three clients, and it did so in about 3% of games played at random. It creates pressure but does not win.
- **Powers do not react to the player.** Each follows a fixed list of two plans. They never respond to who you favored or what you built.
- **The adviser does not plan.** It scores each action on its own and ignores recruitment order, which is the main strategic question since relations were added. A player who follows it blindly wins about 57% of the time.
- **Motion was tuned from screenshots.** Token flight (620 ms), floating numbers (1.9 s), and playback (1.9 s per event, 1.5 s when there are more than seven) have never been judged by eye.
- **Inviting is a chore.** When every gate is open there is no decision in clicking Invite. It could happen on its own at season's end.
- **No save.** Closing the tab ends the game. Only two preferences persist, in `localStorage` under `aman-prefs`.
- **No analytics.** Playtest results would have to be reported by hand.
- **Map labels can still crowd** around the Ganges plain, where the Gangetic Union and Himalayan Accord sit close together. Names now draw above the arrows and rails, with the two powers' gate dots and strain marks on their far sides, and the Himalayan Company flag is lifted clear of the Gangetic Union's pins. Floating numbers can still overlap there, and in Act 3 a power can carry four pins at once.
- **Attention pins have not been tried on a real phone.** On touch, the first tap on a pin or a power that needs you shows its sentences, and a second tap or the Open button opens the dossier. Playwright's touch emulation passes; a thumb has not tried it.
- **Weather motion has not been judged by eye.** Clouds cross the map in 40 to 70 seconds, fog drifts on a 22-second swing, and spring heat rises every 3 seconds. All were set from still screenshots. The parched-ground crack pattern is a repeating tile and may read as mechanical.
- **Terrain marks are dense in dark mode** over the Deccan, where the Ghats, Satpura, and Vindhya ranges meet. They sit under the glows and pins but add texture behind the arrows.
- **Scene motion has not been judged by eye.** The signing seal drops in 560 ms after the 620 ms token flight, the glow pulses for 1.5 s, council seats light 320 ms apart, and the ending chart draws in 2.4 s with ratification seals stamping 380 ms apart. All were set from screenshots.
- **Joins and pledges stamp only right after you act.** Neither can happen during resolution, so the season playback never shows a signing. A rejoin stamps the same as a first join.
- **The council result is a new stop.** After you choose, the chamber lights its votes and waits for Continue before the season playback. It adds a click per council item; Act 2 can hold three items in one season.
- **Sparkline lines mean different things.** The dashed line on a chip is the trust that matters next: joining (55) outside, seceding (40) for a member in Acts 1 and 2, pledging (65) or keeping a pledge (62) in Act 3. The chip's tooltip names it, but players may read every dashed line as the join line.
- **The campaign chart is busy in a long Act 3.** Five lines crowd between 60 and 100 trust once every power is a member. Markers can overlap when two powers have events at the same trust in the same season.
- **Dispute portraits only tilt toward each other.** The faces are drawn front-on, so "facing" is a lean, not a profile.
- **The realistic map needs the regional review.** The land shape and seat cities come from Natural Earth. Territory glows are small circles around each seat so they do not trace present-day countries, but the framing as a whole has not been reviewed by people from across the region.
- **Friendly ties show on the map only for the selected power,** to cut clutter. This may hide useful information.
- **Leader portraits are simple line art.** The owner was told they may read as cartoonish and offered a plain emblem instead. He has not said.
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
- **Decision scenes for crises:** the rogue-power crisis is still a text dialog. It could be a scene like disputes, and the auto-resolved battle could show on the map.
- **Action cards** dragged onto the map in place of buttons.
- **A richer map:** cities that grow, trade ships.
- **A playable replay:** the ending chart is static. Scrubbing it could replay the map season by season from `S.history`, which would need relations and needs recorded too.

From the original design:

- **The real-time battle layer.**
- **All four rogue types** and conquest as a costly option.
- **Sixteen powers** and a choice of which to play.

## Open design questions

- Can a rogue power be right? Does the game admit it when the player's federation caused a breakaway?
- Which sixteen powers, and what makes each play differently?
- Is the Company playable?
- What engine for the full game? The owner has used Godot 4 for other games. The prototype's `engine.js` was written to be portable: it has no DOM and no dependencies.
