# Rules as implemented

Everything here is in `engine.js`. If this file and the code disagree, the code is right and this file needs fixing.
All numbers are placeholders chosen to make a twelve-season game work. None are final.

## Goal

You lead the Deccan Compact (Hyderabad). Bring 4 of the 5 other powers into the federation within 12 seasons.

| Outcome | Condition |
| --- | --- |
| Win | 4 members at any point |
| Partial | 3 members when season 12 ends |
| Loss | 2 or fewer members when season 12 ends |
| Loss | 3 powers are Company clients (grip 2 or more) at the end of any season |

## The season

One turn is one season: Spring, Monsoon, Autumn, Winter. The game starts in Spring 2050.

1. **Start of season:** research completes, income arrives, the monsoon is rolled (Monsoon seasons only), requests appear, the Company picks targets, powers start plans, a dispute may arise.
2. **Crisis,** if a power has gone rogue. Then **dispute,** if one arose.
3. **Actions:** spend Influence and resources.
4. **Council:** a charter vote at the end of seasons 3, 6, and 9.
5. **Resolution:** ignored requests, trust drift, plans advance, members quarrel, the Company moves, secession, win and loss checks.

## Resources

Start: Water 3, Energy 3, Food 3, Capital 5.

| Per season | Amount |
| --- | --- |
| Water, Energy, Food | +2 each, minus 1 each for home consumption |
| Capital | +3, plus 1 per member |
| Influence | 3, or 4 once any power has joined. Not banked. |

A shortage of Water, Energy, or Food at home costs 1 Influence that season.

**Monsoon** (seasons 2, 6, 10): 25% failed (Water -2, Food -2, one extra request), 45% normal (+1, +1), 30% strong (Water +3, Food +2).

## The five powers

| Power | Seat | Start trust | Need 1 | Need 2 |
| --- | --- | --- | --- | --- |
| Indus League | Lahore | 30 | Water share | Autonomy |
| Himalayan Accord | Kathmandu | 40 | Hydro exports | Food |
| Delta Republic | Dhaka | 45 | River flow | Flood protection |
| Gangetic Union | Patna | 36 | Food | Industry |
| Coastal League | Kochi and Colombo | 42 | Trade | Energy |

Each need runs from 0 to 3 points, so a power has 6 points in total.

## The four gates to joining

A power joins when you invite it and all of these hold:

1. Trust at 55 or more.
2. 4 of its 6 need points met.
3. Company grip below 2.
4. No rival of its own is already a member (from season 3).

A member secedes if its trust falls below 40.

## Actions

| Action | Cost | Effect |
| --- | --- | --- |
| Send envoy | 1 Influence | Trust +5 |
| Answer a request | 1 Influence + 2 of the resource | Trust +8, and a need point if the resource matches a need |
| Send aid | 1 Influence + 2 of the resource | Trust +5, need +1 |
| Sign a pact (once per power, trust 40) | 1 Influence, some cost Capital | Trust +6 plus the pact's effect |
| Counter the Company | 1 Influence + 2 Capital | Grip -1, trust +3, blocks this season's deal |
| Invite | 1 Influence | Joins if all gates are open |
| Build a project | 2 Influence + Capital | See below |
| Research | 1 Influence + 3 Capital | Ready next season. One at a time. |
| Broker talks | 1 Influence + 2 Capital | Two powers move one step closer, each trusts you 2 more. Both need trust 40. |
| Back a plan | 1 Influence | Plan lands a season sooner, trust +6, harmed powers -4 |
| Talk it out of a plan (trust 45) | 1 Influence | Plan dropped, trust -3 |

**Pacts:** Autonomy Guarantee (Indus, autonomy +1). Power Purchase Agreement (Himalayan, hydro +1, you gain 1 Energy and pay 1 Capital a season). Relief Corridor (Delta, 2 Capital, flood +1). Industry Compact (Gangetic, 2 Capital, industry +2, Coastal trust -5). Trade Pact (Coastal, trade +2, +1 Capital a season, Gangetic trust -5).

**Projects** (partners need trust 45): Himalayan Hydro Grid (5 Capital). River Flow Compact (4). Indus Water Treaty (4). Subcontinental Rail (6, any two powers). The Hydro Grid and the Flow Compact each hurt the other river state unless you hold run-of-river turbines.

**Research:** drought-resistant crops, desalination, run-of-river turbines, flood defense, civil defense doctrine.

## Ignored requests and drift

- An unanswered request costs 6 trust, or 10 from a member.
- A non-member you did not deal with this season loses 1 trust.
- A member gains 1 trust a season if its needs are at 4, and loses 2 if not.

## The Company (from season 2)

- Each season it courts the power with the lowest trust. Members at trust 55 or more are immune.
- Once you have 3 members it courts two powers a season.
- You block a deal by gaining 10 trust with that power in the season, or by countering.
- Unblocked, grip rises by 1. Grip 1: taking money. Grip 2: client, will not join. Grip 3: rogue, leaves the federation if a member.
- **A rogue power triggers a crisis** next season: address the grievance (4 Capital, grip to 0, trust +12), defend (auto-resolved battle), or contain (Capital -1, Food -1, stays a client).
- **Battle odds:** 45%, +10% per member, +15% with a common defense force, +20% with civil defense doctrine.

## Relations (from season 3)

Each pair of powers is Rival (-2), Tense (-1), Neutral, Friendly (+1), or Allied (+2).

Starting ties: Indus and Gangetic are rivals. Himalayan and Delta are tense. Gangetic and Coastal are tense. Delta and Coastal are friendly. Himalayan and Gangetic are friendly.

- **Spillover:** helping a power shifts trust with every other power by (amount x relation / 2). The amount is 2 for aid and requests, 4 for a pact, 8 for a power joining.
- **Rivals block:** a power will not join while its rival is a member.
- **Quarrels:** two members with a negative relation each lose twice that relation in trust every season. Friendly members gain 1.
- **Disputes:** from season 3 there is a 40% chance each season that two unfriendly powers bring you a quarrel. Back one (+8 and -8), mediate (3 Capital + 1 Influence, one step closer, +3 each), or stay out (-3 each, one step apart).

## Plans (from season 4)

Each power runs plans of its own from a fixed list of two, on a countdown of 3 or 4 seasons, with a 2-season pause between plans. Each plan has an effect when it lands and a condition that makes the power drop it. Examples: the Himalayan Accord builds the Karnali dams (dropped if you hold run-of-river turbines); the Indus League fortifies its border with Company arms (dropped if it is no longer a rival of the Gangetic Union). The full list is `PLANS` in `engine.js`.

## Charter votes

At the end of seasons 3, 6, and 9. You propose one of two options. Each member votes yes if the option does not cost it trust. You hold one vote and ties go your way. If your proposal fails, the other option is adopted.

1. Strong center or loose union.
2. Open market or protected industry.
3. Common defense force or local militias.

## Staged introduction

Season 1: trust, needs, requests. Season 2: the Company. Season 3: relations and disputes. Season 4: plans.
