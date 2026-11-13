# Aman: design

Two documents from the design sessions, merged. The first is the vision for the full game. The second is the turn-to-turn loop the prototype implements. Where the prototype's numbers differ from this text, `docs/rules.md` is current.

---

# Part 1: one-page design doc

## Pitch

Aman is a turn-based strategy game about reuniting the Indian subcontinent by consent in 2050. You win by building a federation that sixteen rival powers choose to join, and you fight real-time battles only when diplomacy fails.

- **Genre:** Civ-style diplomacy and map strategy, with occasional StarCraft-style base-defense battles.
- **Player fantasy:** the statesman who ends a warring-states era without becoming a conqueror.
- **Platform:** PC, single-player first.
- **Title:** working title. Aman means peace in Urdu, Hindi, and Bengali.

## Setting

Climate shocks and water crises in the 2040s broke the subcontinent's nation-states into sixteen regional powers: city-states, river federations, coastal leagues. The number echoes the sixteen Mahajanapadas of 600 BCE. Every faction starts as a peer and any is playable, from Lahore to Dhaka to Colombo. No present-day country is the protagonist.

The antagonist is the Company, a private arms and security conglomerate that sells to every side and profits from division. It echoes the East India Company, which won the 18th century by playing rivals against each other.

## Design pillars

1. **Consent over conquest.** The federation grows when factions choose to join. Force is available and always the worse path.
2. **Enemies have grievances.** Every hostile faction has a stated reason and a way back in.
3. **The layers feed each other.** Diplomacy decides who fights beside you. Conduct in battle changes diplomacy.
4. **Success creates strain.** Each new member adds competing interests, so the federation gets harder to hold as it grows.

## Strategic layer (turn-based, most of the game)

- **Trust:** tracked per faction. It rises with trade, disaster relief, kept treaties, and coming to a neighbor's defense. It falls with broken promises and ignored needs.
- **Shared infrastructure as the tech tree:** water treaties on the Indus and the Ganges-Brahmaputra, power grids, rail, a common currency. Each project needs partners, so research is itself diplomacy.
- **Conquest is allowed but costly:** occupied regions breed insurgency and push watching factions toward the Company.
- **Federation vote:** a faction joins when its trust and its interests both clear a threshold. Members vote on later policy, and can leave.
- **The Company's turn:** each turn it funds and arms the most aggrieved faction on the map.

## Rogue factions

Rogues come out of the diplomacy system, never a random spawner. The player can always trace one back to a cause.

| Type | Where it comes from | Non-military remedy |
| --- | --- | --- |
| Spoiler | A faction whose trust collapsed or whose interests the federation overrode | Address the grievance |
| Splinter | Hardliners who reject their faction's decision to join | Offer autonomy terms or amnesty |
| Company client | An aggrieved group the Company arms | Cut the funding and supply routes |
| Warlord | An opportunist in ungoverned territory | Extend services and governance |

For each rogue the player chooses to fight, remedy, or contain. Force ends the threat fast and leaves resentment in the region. Reintegration is slower and pays more trust.

## Battle layer (real-time, rare)

- **Frequency:** about one battle every five to ten turns. Minor fights auto-resolve.
- **Length:** ten minutes or less.
- **Format:** build and defend a base. Hold a dam, protect a relief corridor, break the siege of an ally.
- **Setup comes from the map:** tech, unit roster, and starting resources carry over from the strategic layer.
- **Coalitions:** allies you earned through trust arrive with their own units and bases.
- **Conduct counts:** protecting civilians and infrastructure raises trust. Flattening a city to win costs trust with every faction watching.

## Win and loss

- **Win:** a supermajority of factions ratifies the federation charter. Starting target: 12 of 16, to be tuned.
- **Lose:** your home faction falls, the federation dissolves, or the Company holds a majority of factions as clients.
- **Hollow win:** unifying by conquest ends the game with an unstable empire and a different epilogue.

## Risks and open questions

**Risks**

- **Scope:** this is two games in one. Build the strategic layer first and auto-resolve every battle until it is fun.
- **Pacing:** long or frequent battles stall a turn-based campaign. Hold the ten-minute cap.
- **Sensitivity:** the setting uses real places, peoples, and a live political question. Plan for reviewers from across the region before any public build.

**Open questions**

- Can a rogue faction be right? Does the game admit when the player's federation caused a breakaway?
- Which sixteen powers, and what makes each play differently?
- Is the Company a playable or purely AI opponent?
- Engine and art style?

---

# Part 2: core loop and progression

A proposal for how Aman plays turn to turn: factions join the federation when you earn their trust and meet their needs, one season at a time.

## Core mechanic

Every faction has **needs** and a **trust** score toward you. Needs are concrete: water security, energy, food, protection, autonomy, trade access, cultural recognition. A faction joins the federation when you have earned its trust and membership meets its needs better than staying out.

The puzzle is that needs conflict. An upstream river state wants dams; the downstream delta wants flow. A coastal league wants open trade; an inland state wants protected industry. You cannot please everyone, so the game is about sequencing, trade-offs, and compromise.

## Resources

- **Water, Energy, Food:** produced by regions, consumed by populations. Shortages create grievances.
- **Capital:** pays for projects, aid, and defense.
- **Influence:** your diplomatic action points. It limits how many envoys, treaties, and proposals you can run per turn, so you must choose where to pay attention.

## A turn

One turn is one season, four per year. That makes the monsoon a recurring event: a good one fills reservoirs, a failed one triggers crises across the map.

1. **Briefing:** the season's weather, crises, requests from other factions, and visible Company moves.
2. **Income:** collect resources and see shortfalls.
3. **Actions:** spend Capital and Influence. Send envoys, propose treaties, give aid, start or join projects, queue research, position defense forces.
4. **Council:** once a federation exists, members vote on one proposal per turn. You lobby; you do not dictate.
5. **Resolution:** other factions and the Company act, trust and grievances update, and any battle triggers.

## Four trees

| Tree | Who advances it | What it holds | What it does |
| --- | --- | --- | --- |
| Infrastructure | You and partner factions | Water treaties, power grids, rail, a common currency | Binds members together and makes leaving costly. Advancing it is diplomacy. |
| Technology | You alone, through research | Desalination, drought-resistant crops, flood defense, clean energy, information systems | Solves needs directly and gives you things to share as aid. |
| Charter | Federation members, by vote | Strong center or loose union, revenue sharing, language policy, open borders, common defense | Exclusive branches attract some factions and repel others, so each playthrough builds a different federation. |
| Defense doctrine | You alone | Units and structures for real-time battles | Weighted toward fortification, relief, and non-lethal options. |

The Charter is the most distinctive of the four: it is the federation's constitution, written through play.

## What makes a turn interesting

The Company targets your weakest relationship each turn, so every action you take somewhere is a risk you accept somewhere else. That keeps turns tense without constant war.

---

# Part 3: what the prototype changed

The prototype cut the design down to test the loop. The gaps between it and the vision above are deliberate.

- **5 powers, not 16,** plus the player's fixed home state.
- **12 seasons,** not an open-ended campaign.
- **Only the player's state is playable.**
- **Battles are one dice roll.**
- **The charter is three two-way votes,** not a tree.
- **Only the Company-client rogue type exists.** Spoilers appear as secession. Splinters and warlords are not built.
- **Conquest is not in the prototype at all.**
