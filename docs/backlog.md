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
- **Map labels can collide** with suggestion arrows and floating numbers.
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
- **Decisions as scenes:** disputes as two leaders across a table, charter votes as a chamber with a seat per member, a signing moment when a power joins.
- **Action cards** dragged onto the map in place of buttons.
- **A richer map:** an accurate coastline, terrain, cities that grow, trade ships.
- **An end-of-game replay** of all twelve seasons with a trust line per power.

From the original design:

- **The real-time battle layer.**
- **All four rogue types** and conquest as a costly option.
- **Sixteen powers** and a choice of which to play.

## Open design questions

- Can a rogue power be right? Does the game admit it when the player's federation caused a breakaway?
- Which sixteen powers, and what makes each play differently?
- Is the Company playable?
- What engine for the full game? The owner has used Godot 4 for other games. The prototype's `engine.js` was written to be portable: it has no DOM and no dependencies.
