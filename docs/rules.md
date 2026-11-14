# Rules as implemented

Everything here is in `engine.js`. If this file and the code disagree, the code is right and this file needs fixing.
All numbers are placeholders chosen to make a 36-season, three-act game work. None are final.

## Goal

You lead the Deccan Compact (Hyderabad). The game runs in three acts, up to 36 seasons (2050 to 2058).

| Act | Name | Length | Goal to advance |
| --- | --- | --- | --- |
| 1 | Neighbors | Up to 12 seasons (seasons 1 to 12) | 3 members at the end of any season |
| 2 | Strain | Exactly 12 seasons | 4 members when its last season ends |
| 3 | Charter | Up to 12 seasons | 4 pledges when the ratification vote is held |

All act changes and endings happen at the end of a season, in this order (the first match wins):

| Outcome | Condition |
| --- | --- |
| Loss: The Company wins | 3 powers are Company clients (grip 2 or more), any act |
| Loss: The federation breaks apart | Act 2 or 3, 1 member or none |
| Ratification vote | Act 3, in the season you called it or at the end of its 12th season |
| Act 2 begins | Act 1, 3 or more members |
| Loss: Still divided | Act 1, season 12 ends with 2 members or fewer |
| End of Act 2 | 4 or more members: Act 3 begins. 3: partial, "A fragile federation". 2: loss, "The federation breaks apart" |

| Ratification result | Condition |
| --- | --- |
| Win: Aman | 5 pledges |
| Win: The charter is ratified | 4 pledges |
| Loss: The Company wins | 3 or fewer pledges and 2 or more Company clients |
| Partial: A federation without a charter | 3 or fewer pledges and 3 or more members |
| Loss: The federation breaks apart | 3 or fewer pledges and 2 members or fewer |

## The season

One turn is one season: Spring, Monsoon, Autumn, Winter. The game starts in Spring 2050.

1. **Start of season:** research completes, income arrives, the monsoon is rolled (Monsoon seasons only), requests appear, the Company picks targets, powers start plans, a dispute may arise.
2. **Crisis,** if a power has gone rogue. Then **dispute,** if one arose.
3. **Actions:** spend Influence and resources.
4. **Council:** charter votes at the end of seasons 3, 6, and 9; motions at Act 2 seasons 3, 6, 9, and 12; articles at Act 3 seasons 3 and 6.
5. **Resolution:** ignored requests, unmet demands, trust drift, rivals harden, plans advance, members quarrel, the Company moves, secession and walkouts, pledge checks, then act changes and endings.

The council is a queue (`S.agenda`). One season can hold, in this order: the Act 1 charter question for that season, Act 2 motions due that season, and the Act 3 article for that act season. Each item is a two-option vote.

## Resources

Start: Water 3, Energy 3, Food 3, Capital 5.

| Per season | Amount |
| --- | --- |
| Water, Energy, Food | +2 each, minus 1 each for home consumption |
| Capital | +3, plus 1 per member |
| Influence | Act 1: 3, or 4 once any power has joined. Act 2: 4, or 5 with 4 or more members. Act 3: 6. Not banked. |
| Upkeep | Each passed motion with upkeep costs its amount each season while its proposer is a member. |

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

From Act 2, a power with strain has a fifth gate: "Grievance heard" (strain at 0). Accession terms waive the rival gate.

A member secedes if its trust falls below 40. It gains a step of Company grip. From Act 2 it also records the grievance "it no longer trusts the federation". A member also leaves when it goes rogue (grip 3), whether through the Company or through its own plan. Only a walkout is shown as "Walked out" and leaves a grievance to hear; a secession shows as "Seceded".

## Actions

| Action | Cost | Effect |
| --- | --- | --- |
| Send envoy | 1 Influence | Trust +5 |
| Answer a request | 1 Influence + 2 of the resource | Trust +8, and a need point if the resource matches a need |
| Send aid | 1 Influence + 2 of the resource | Trust +5, need +1 |
| Sign a pact (once per power, trust 40) | 1 Influence, some cost Capital | Trust +6 plus the pact's effect |
| Counter the Company | 1 Influence + 2 Capital | Grip -1, blocks this season's deal. Trust +3, except for a member from Act 2 |
| Invite | 1 Influence | Joins if all gates are open |
| Build a project | 2 Influence + Capital | See below |
| Research | 1 Influence + 3 Capital | Ready next season. One at a time. |
| Broker talks | 1 Influence + 2 Capital | Two powers move one step closer, each trusts you 2 more. Both need trust 40. |
| Back a plan | 1 Influence | Plan lands a season sooner, trust +6, harmed powers -4 |
| Talk it out of a plan (trust 45) | 1 Influence | Plan dropped, trust -3 |
| Grant a claim (Act 2 on) | 1 Influence + 3 of the resource | Trust +2, a need point if the resource matches a need, spillover 2 |
| Pay a budget share (Act 2 on) | 1 Influence + Capital: 2, plus 1 with 4 or more members, plus 1 for every 10 Capital you hold when it is asked | Trust +2, spillover 2 |
| Hear its grievances (Act 2 on, strain above 0) | 1 Influence + 2 Capital | Strain -1, trust +3 |
| Ask it to ratify (Act 3, member) | 1 Influence | Pledges at trust 65, 5 of 6 need points, grip 0, strain 0. Trust +3 |
| Offer accession terms (Act 3 from its 3rd season, non-member, trust 35, once per power) | 2 Influence + 3 Capital | Trust +8, weakest need +1, grievance cleared, rival gate waived |
| Call the ratification vote (Act 3 from its 8th season, 4 pledges) | 1 Influence | The vote is held at the end of this season |

**Pacts:** Autonomy Guarantee (Indus, autonomy +1). Power Purchase Agreement (Himalayan, hydro +1, you gain 1 Energy and pay 1 Capital a season). Relief Corridor (Delta, 2 Capital, flood +1). Industry Compact (Gangetic, 2 Capital, industry +2, Coastal trust -5). Trade Pact (Coastal, trade +2, +1 Capital a season, Gangetic trust -5).

**Projects** (partners need trust 45): Himalayan Hydro Grid (5 Capital). River Flow Compact (4). Indus Water Treaty (4). Subcontinental Rail (6, any two powers). The Hydro Grid and the Flow Compact each hurt the other river state unless you hold run-of-river turbines.

**Research:** drought-resistant crops, desalination, run-of-river turbines, flood defense, civil defense doctrine.

## Ignored requests and drift

- An unanswered request costs 6 trust, or 10 from a member. From Act 2 only non-members make requests.
- A non-member you did not deal with this season loses 1 trust.
- In Act 1 a member gains 1 trust a season if its needs are at 4, and loses 2 if not.
- From Act 2 members expect more. A member with its needs at 4 loses 1 trust a season, or 4 if its trust is above 70. One with needs below 4 loses 2. The playback shows this as one event with a number over each member.

## The Company (from season 2)

- Each season it courts the power with the lowest trust. Members at trust 55 or more are immune.
- Once you have 3 members it courts two powers a season.
- **Act 2:** it courts two powers a season. Members are immune at trust 60. From the act's 3rd season it ranks powers by trust minus 5 for each member they are Tense or Rival with.
- **Act 3:** two powers in its first season (immunity 60), then three a season with no immunity. It picks pledged powers first, lowest trust first, then by the Act 2 ranking.
- You block a deal by gaining 10 trust with that power in the season, or by countering.
- Unblocked, grip rises by 1. Grip 1: taking money. Grip 2: client, will not join. Grip 3: rogue, leaves the federation if a member.
- **A rogue power triggers a crisis** next season: address the grievance (4 Capital, grip to 0, trust +12), defend (auto-resolved battle), or contain (Capital -1, Food -1, stays a client).
- **Battle odds:** 45%, +10% per member, +15% with a common defense force, +20% with civil defense doctrine.

## Relations (from season 3)

Each pair of powers is Rival (-2), Tense (-1), Neutral, Friendly (+1), or Allied (+2).

Starting ties: Indus and Gangetic are rivals. Himalayan and Delta are tense. Gangetic and Coastal are tense. Delta and Coastal are friendly. Himalayan and Gangetic are friendly.

- **Spillover:** helping a power shifts trust with every other power by (amount x relation / 2). The amount is 2 for aid, requests, and demands, 4 for a pact, and for a power joining 8 in Act 1 and 12 from Act 2.
- **Rivals block:** a power will not join while its rival is a member.
- **Quarrels:** two members with a negative relation each lose twice that relation in trust every season. Friendly members gain 1.
- **Disputes:** from season 3 there is a 40% chance each season that two unfriendly powers bring you a quarrel. Back one (+8 and -8), mediate (3 Capital + 1 Influence, one step closer, +3 each), or stay out (-3 each, one step apart). From Act 2, if both are members, the one you did not back gains a strain mark.
- **Rivals harden** (Act 2 from its 3rd season, and Act 3): each non-member with grip below 3 loses 1 trust a season for every member it is Tense or Rival with.

## Plans (from season 4)

Each power runs plans of its own from a fixed list of two, on a countdown of 3 or 4 seasons, with a 2-season pause between plans. From Act 2, a plan that has landed does not start again, except the three Company plans (fortify the border, seek a security contract, appeal for flood aid). Each plan has an effect when it lands and a condition that makes the power drop it. Examples: the Himalayan Accord builds the Karnali dams (dropped if you hold run-of-river turbines); the Indus League fortifies its border with Company arms (dropped if it is no longer a rival of the Gangetic Union). The full list is `PLANS` in `engine.js`.

## Charter votes

At the end of seasons 3, 6, and 9. You propose one of two options. Each member votes yes if the option does not cost it trust. You hold one vote and in Act 1 ties go your way. If your proposal fails, the other option is adopted.

1. Strong center or loose union.
2. Open market or protected industry.
3. Common defense force or local militias.

**From Act 2** every council vote, including an Act 1 question that falls in Act 2, follows these rules, first match wins (`votePreview`). Your proposal needs a majority: ties go against you.

| Rule | Vote |
| --- | --- |
| It proposed this motion | Yes on pass, no on reject |
| Company grip 1 or more | No |
| Trust below 50 | No |
| The option costs it trust | No |
| Strain above 0 and the option gains it nothing | No |
| Otherwise | Yes |

## Act 2: Strain

- **Demands** replace requests for members. Each season `ceil(members / 2)` members are drawn, plus one claim in a failed monsoon. Each draw is a claim (55%: 3 of a resource, picked the way requests are) or a budget share (45%: 2 Capital, plus 1 with 4 or more members, plus 1 for every 10 Capital in your treasury). From the act's 2nd season, a member with no pending motion has a 25% chance to table a motion instead, at most 2 per council.
- **Unmet demands** at season's end cost 6 trust and add a strain mark. In Act 3 a pledged member loses the trust but gains no strain mark: its pledge then rests on the trust gate. An unpaid budget share from a member at strain 2 or more with no Company grip sends it to the Company for the money: grip +1.
- **Strain** runs 0 to 3. An unmet demand, a rejected motion, or backing the other member in a dispute raises it. Hearing its grievances or passing its motion lowers it. At 3 a member walks out at season's end, with a grievance taken from its last strain mark. It gains no Company grip. Strain carries over when a power leaves. It rejoins through the normal gates plus "Grievance heard".
- **Motions:** councils sit at act seasons 3, 6, 9, and 12. Each member has two motions, tabled in order (`MOTIONS` in `engine.js`). Pass: the motion's trust and need effects, proposer +8 trust and -1 strain, and its upkeep while the proposer is a member. Reject: proposer -8 trust and +1 strain. A motion whose proposer has left is dropped.

## Act 3: Charter

- **Influence** is 6 a season in Act 3.
- When Act 3 begins, every non-member below grip 3 is a holdout with a stated grievance: its rival sits in the federation, Company money pays its leaders, an unmet need, or it does not trust you yet. A power that walked out keeps its walkout grievance in the last case.
- **Pledges:** a member pledges when asked at trust 65, 5 of 6 need points, grip 0, and strain 0. At the end of each season a pledge is withdrawn if the power left, took Company money (grip 1 or more), fell below trust 62, or carries strain.
- Members keep making claims and shares. Motions stop.
- **Articles:** two more charter questions at act seasons 3 and 6: equal revenue shares or by population; open borders or managed movement.
- **The ratification vote** is held at the end of the season you call it (from act season 8, with 4 pledges), or at the end of act season 12. Pledged powers ratify.

## Staged introduction

Season 1: trust, needs, requests. Season 2: the Company. Season 3: relations and disputes. Season 4: plans.

Act 2: demands, strain, and hearing grievances in its 1st season; motions and the new vote rules in its 2nd; hardening in its 3rd. Act 3: pledges in its 1st season; the Company goes all in in its 2nd; holdouts and terms in its 3rd; calling the vote in its 8th.
