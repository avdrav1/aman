# The sixteen powers

Approved by the owner in November 2026. This replaces the five-power cast. The player is still the Deccan Compact. The other fifteen are rivals that can join.

The number sixteen echoes the Mahajanapadas, but the powers are modern regional powers of 2050 spread across the whole subcontinent, with neutral geographic names. Do not use Mahajanapada names, or any ethnic, religious, or single-language names. See the sensitivity section in `CLAUDE.md`.

| # | Power | Seat | Region | Two needs | Main tension |
| --- | --- | --- | --- | --- | --- |
| 1 | Deccan Compact (player) | Hyderabad | Deccan plateau, including Bengaluru | (as today) | Upstream of the Coromandel Coast on the Kaveri |
| 2 | Indus League | Lahore | Upper Indus plains | Water share, autonomy | Upstream of Lower Indus Ports |
| 3 | Lower Indus Ports | Karachi | Lower Indus and its coast | River flow, trade | Downstream of the Indus League |
| 4 | Western Passes Council | Peshawar | Northwest uplands and mountain passes | Protection, trade routes | The Company's easiest foothold |
| 5 | Aravalli Council | Jaipur | Thar desert and the Aravalli hills | Water, energy exports (desert solar) | Wants Yamuna water |
| 6 | Yamuna Compact | Delhi | The capital megacity region | Food, energy | Draws water from neighbors |
| 7 | Gangetic Union | Lucknow | Middle Ganges plain, including Bihar | Food, industry | Downstream of Himalayan dams |
| 8 | Himalayan Accord | Kathmandu | Central and eastern Himalaya, including Bhutan | Hydro exports, food | Dams upset everyone downstream |
| 9 | Brahmaputra League | Guwahati | Brahmaputra valley and the northeast hills | Flood protection, connection by rail and trade | Upstream of the Delta |
| 10 | Delta Republic | Dhaka | Ganges–Brahmaputra delta | River flow, flood protection | Downstream of everyone |
| 11 | Mahanadi Coast | Bhubaneswar | Eastern coast and its mineral belt | Cyclone protection, industry | Coal power against coastal neighbors |
| 12 | Narmada Highlands | Bhopal | Central forests and plateau | Autonomy, water | Narmada dams against the Western Seaboard |
| 13 | Western Seaboard | Mumbai | Konkan and Gujarat coasts | Trade, energy | Finance hub the Company courts |
| 14 | Malabar Ports | Kochi | Southwest coast | Trade, food | Port rivalry with the Island Compact |
| 15 | Coromandel Coast | Chennai | Southeast coast | Water (Kaveri), energy | Downstream of the player on the Kaveri |
| 16 | Island Compact | Colombo | Sri Lanka | Trade, protection at sea | Fishing waters with the Coromandel Coast |

## Changes from the five-power cast

- Indus League, Himalayan Accord, Delta Republic, and Gangetic Union keep their names. The Gangetic Union's seat is now Lucknow.
- The Coastal League splits into Malabar Ports and the Island Compact.

## Choices flagged for the regional review

- No power is seated in Kashmir. The Indus League and the Himalayan Accord cover the north without a seat there. The omission is itself a choice reviewers should see.
- The Coromandel Coast and Island Compact tension is framed only as fishing waters. The real Palk Strait dispute touches ethnic tensions; drop it if reviewers prefer.
- "Western Passes Council" avoids "Frontier", a colonial-era label for the region.
- Seats by present-day country: 3 in Pakistan, 1 in Bangladesh, 1 in Sri Lanka, 1 in Nepal (Bhutan inside the Himalayan Accord), 10 in India.

## Win target

The design doc's target is 12 of 16, counting the player. As built, Act 3 needs 11 pledges of 15 rivals, which is 12 of 16 with you. Act 1 needs 8 members and Act 2 needs 11. See `docs/rules.md` for every scaled number.

## As built in the engine

Built in November 2026 in `public/engine.js`. Each power is one entry in `POWERS`. The rules read the table and never test a power's id, so changing a power means editing its entry only. The order of the table is the order the engine walks the powers, which fixes the random stream.

### Shape of an entry

| Field | Meaning |
| --- | --- |
| `id`, `name`, `short`, `seat`, `lat`, `lon` | Identity and the seat city's coordinates |
| `hue` | A hue suggestion in degrees for the map. The UI picks the real colors. |
| `title` | The leader's title. No names, no dress or faith markers. |
| `trust`, `planWait` | Starting trust, and how long before its first plan |
| `blurb` | One line for the dossier |
| `needs` | Two needs: `key`, `label`, `res` (the resource that feeds it, if any), `how` (what raises it, shown to the player) |
| `pact` | `name`, `effect` (text), `cost`, `does` (effects), `income` (per season while signed), `msg` (extra text when signed) |
| `ties` | Its relations: `{ other: { rel, topic } }`. Only listed pairs exist. Every other pair is neutral and never changes. |
| `plans` | Two plans: `key`, `name`, `eta`, `harmed`, `then`, `endIf`, `cancel` (a condition), `does` (effects), `repeat` (a Company plan that runs again from Act 2), `fine` (the adviser leaves it alone) |
| `motions` | Two Act 2 motions: `key`, `short`, `name`, `text`, `pips`, `trust`, `upkeep` |

Effects are short lists: `['pip', power, need, d]`, `['trust', power, d]`, `['rel', a, b, d]`, `['grip', power]`, `['all', d]`, `['ally', a, b]`, `['pactTrust', power, ifSigned, ifNot]`, and `['res', resource, d]`, which takes from your own stock. Conditions: `['tech', key]`, `['project', key]`, `['charter', key]`, `['pact', power]`, `['relAbove', a, b, v]`, `['pipAtLeast', power, need, v]`.

Projects and research use the same effect lists (`does`, and `hurts` unless you hold the `spared` research).

### Needs in play

| Key | Generic label | Fed by | Held by |
| --- | --- | --- | --- |
| `water` | Water | Water | Indus League, Aravalli Council, Narmada Highlands, Coromandel Coast |
| `flow` | River flow | Water | Lower Indus Ports, Delta Republic |
| `food` | Food | Food | Yamuna Compact, Gangetic Union, Himalayan Accord, Malabar Ports |
| `energy` | Energy | Energy | Yamuna Compact, Western Seaboard, Coromandel Coast |
| `security` | Protection | Capital | Western Passes Council, Island Compact (protection at sea) |
| `link` | Connection | Capital | Brahmaputra League |
| `storm` | Cyclone protection | Capital | Mahanadi Coast |
| `trade` | Trade | Pacts, rail, charter | Lower Indus Ports, Western Passes Council (trade routes), Western Seaboard, Malabar Ports, Island Compact |
| `autonomy` | Autonomy | Pacts, charter | Indus League, Narmada Highlands |
| `industry` | Industry | Pacts, rail, charter | Gangetic Union, Mahanadi Coast |
| `hydro` | Hydro exports | Pact, Hydro Grid | Himalayan Accord |
| `flood` | Flood protection | Pacts, research, charter | Brahmaputra League, Delta Republic |
| `solar` | Energy exports | Pact, Desert Solar Grid | Aravalli Council |

New need keys are `security`, `link`, `storm`, and `solar`. The three Capital needs let aid, requests, and claims ask for Capital, the way the others ask for Water, Energy, or Food. `Aman.NEED_KEYS` lists every key for the UI.

### Relations

26 pairs, all between neighbors or river partners. Two rivals, six tense pairs, four friendly pairs, the rest neutral.

| Pair | Start | Dispute topic |
| --- | --- | --- |
| Indus League and Lower Indus Ports | Rival | Indus water releases |
| Malabar Ports and Island Compact | Rival | port traffic |
| Aravalli Council and Yamuna Compact | Tense | Yamuna water |
| Gangetic Union and Himalayan Accord | Tense | dam releases |
| Himalayan Accord and Delta Republic | Tense | dam releases |
| Brahmaputra League and Delta Republic | Tense | Brahmaputra flows |
| Narmada Highlands and Western Seaboard | Tense | Narmada dams |
| Coromandel Coast and Island Compact | Tense | fishing waters |
| Indus League and Western Passes Council | Friendly | pass tolls |
| Yamuna Compact and Gangetic Union | Friendly | grain prices |
| Mahanadi Coast and Narmada Highlands | Friendly | mining rights |
| Western Seaboard and Malabar Ports | Friendly | coastal shipping |

Neutral neighbors (each has a dispute topic in its entry, used if the pair sours): Indus and Aravalli, Indus and Yamuna, Lower Indus and Passes, Lower Indus and Aravalli, Lower Indus and Seaboard, Aravalli and Narmada, Aravalli and Seaboard, Yamuna and Himalaya, Gangetic and Delta, Gangetic and Narmada, Gangetic and Mahanadi, Himalaya and Brahmaputra, Delta and Mahanadi, Malabar and Coromandel.

The Kaveri sits between you and the Coromandel Coast. You have no relation track, so the tension is carried by its pact (the Kaveri Release costs you 1 Water a season), its plan (pressing the Kaveri claim takes 2 Water from you), and its motion (a Kaveri tribunal with Water upkeep).

`Aman.NEIGHBORS[id]` lists each power's related neighbors in table order. `Aman.PLAYER.neighbors` lists yours for drawing only: Narmada Highlands, Mahanadi Coast, Western Seaboard, Malabar Ports, Coromandel Coast.

### The powers

The player, the Deccan Compact, has the entry `Aman.PLAYER`: seat Hyderabad (17.39, 78.49), leader "Speaker of the Compact", hue suggestion 28.

### 2. Indus League (Lahore)

- **Id** `indus`, short name Indus, leader: Chair of the League Council. Seat at 31.55, 74.34. Hue suggestion 205.
- **Start trust** 30. Its first plan can start in season 4.
- **Blurb:** Upstream river cities of the Indus plains. Proud, wary of any strong center.
- **Needs:** Water share (`water`, fed by water): Send Water, or build the Indus Water Treaty. Autonomy (`autonomy`): Autonomy Guarantee pact. In the charter: Loose union, Local militias, Managed movement.
- **Pact:** Autonomy Guarantee. Autonomy +1.
- **Plan:** Build barrages on the upper Indus (3 seasons). Water share +1. Lower Indus river flow -1, and the two fall out a step. Dropped if the Indus Water Treaty is built. Backing it costs trust with Lower Indus Ports.
- **Plan:** Seek a Company security contract (3 seasons, repeats). Company grip +1. Dropped if its autonomy need reaches 2.
- **Motion:** Provincial veto on federal policing. Members can block federal police on their soil. Trust: Yamuna Compact -6, Gangetic Union -4.
- **Motion:** Indus waters for the League first. Upstream needs come before any release. Trust: Lower Indus Ports -8. Upkeep: 1 water a season.
- **Neighbors and start relations:** Lower Indus Ports (Rival), Western Passes Council (Friendly), Aravalli Council (Neutral), Yamuna Compact (Neutral).

### 3. Lower Indus Ports (Karachi)

- **Id** `lindus`, short name Lower Indus, leader: President of the Port Council. Seat at 24.86, 67.01. Hue suggestion 190.
- **Start trust** 34. Its first plan can start in season 6.
- **Blurb:** The river mouth and its port city. Lives on what the river brings down and what the ships bring in.
- **Needs:** River flow (`flow`, fed by water): Send Water, or build the Indus Water Treaty. Trade (`trade`): Port Access Treaty pact. In the charter: Open market.
- **Pact:** Port Access Treaty. Trade +1. You gain 1 Capital each season.
- **Plan:** Campaign for downstream water rights (3 seasons). River flow +1. Its relations with the Indus League worsen a step. Dropped if the Indus Water Treaty is built. Backing it costs trust with Indus League.
- **Plan:** Raise port fees on inland trade (3 seasons). Trade +1. Its relations with the Western Passes Council worsen a step. Dropped if the charter settles trade policy. Backing it costs trust with Western Passes Council.
- **Motion:** Minimum flow to the Indus mouth. Upstream barrages must release a set flow. Trust: Indus League -8.
- **Motion:** Federal port fund. The federation dredges and equips member ports. Upkeep: 1 capital a season.
- **Neighbors and start relations:** Indus League (Rival), Western Passes Council (Neutral), Aravalli Council (Neutral), Western Seaboard (Neutral).

### 4. Western Passes Council (Peshawar)

- **Id** `passes`, short name Western Passes, leader: Convener of the Passes Council. Seat at 34.01, 71.58. Hue suggestion 15.
- **Start trust** 26. Its first plan can start in season 5.
- **Blurb:** Uplands that hold the mountain roads. Short of protection, and the Company knows it.
- **Needs:** Protection (`security`, fed by capital): Send Capital for its border guard, or research civil defense doctrine. In the charter: Common defense force. Trade routes (`trade`): Caravan Corridor pact, Subcontinental Rail.
- **Pact:** Caravan Corridor. Trade routes +2. Costs 2 capital.
- **Plan:** Hire Company guards for the passes (3 seasons, repeats). Company grip +1. Dropped if its protection need reaches 2.
- **Plan:** Charge tolls on the mountain roads (3 seasons). Trade routes +1. Its relations with the Indus League worsen a step. Dropped if Subcontinental Rail is built. Backing it costs trust with Indus League and Lower Indus Ports.
- **Motion:** A federal guard for the passes. The federation pays for guards on the mountain roads. Trust: Narmada Highlands -2. Upkeep: 1 capital a season.
- **Motion:** Mountain roads before new rail. Road money goes to the passes first. Trust: Brahmaputra League -4.
- **Neighbors and start relations:** Indus League (Friendly), Lower Indus Ports (Neutral).

### 5. Aravalli Council (Jaipur)

- **Id** `aravalli`, short name Aravalli, leader: Chair of the Aravalli Council. Seat at 26.91, 75.79. Hue suggestion 40.
- **Start trust** 38. Its first plan can start in season 7.
- **Blurb:** Desert and hill country. Short of water, rich in sun, and keen to sell its solar power.
- **Needs:** Water (`water`, fed by water): Send Water, or research desalination. Energy exports (`solar`): Solar Purchase Agreement pact, or build the Desert Solar Grid.
- **Pact:** Solar Purchase Agreement. Energy exports +1. You gain 1 Energy and pay 1 Capital each season.
- **Plan:** Dig a canal from the Yamuna (4 seasons). Water +1. Yamuna food -1, and the two fall out a step. Dropped if you hold desalination. Backing it costs trust with Yamuna Compact.
- **Plan:** Sell desert solar to the Company (3 seasons). Energy exports +1, and Company grip +1. Dropped if the Desert Solar Grid is built.
- **Motion:** A federal solar quota. The federation buys a fixed share of desert solar. Trust: Mahanadi Coast -4. Upkeep: 1 capital a season.
- **Motion:** A fixed share of the Yamuna. The desert gets a set share of the river. Trust: Yamuna Compact -8.
- **Neighbors and start relations:** Indus League (Neutral), Lower Indus Ports (Neutral), Yamuna Compact (Tense), Narmada Highlands (Neutral), Western Seaboard (Neutral).

### 6. Yamuna Compact (Delhi)

- **Id** `yamuna`, short name Yamuna, leader: Mayor of the Capital Region. Seat at 28.61, 77.21. Hue suggestion 330.
- **Start trust** 36. Its first plan can start in season 5.
- **Blurb:** The capital megacity and its suburbs. Hungry for food and power, and it draws water from its neighbors.
- **Needs:** Food (`food`, fed by food): Send Food, or research drought-resistant crops. Energy (`energy`, fed by energy): Send Energy, or build the Hydro Grid or the Desert Solar Grid.
- **Pact:** Capital Region Compact. Food +1, Energy +1. You give 1 Food each season.
- **Plan:** Draw more water upstream (3 seasons). Food +1. Aravalli water -1, and the two fall out a step. Dropped if its food need is fully met. Backing it costs trust with Aravalli Council.
- **Plan:** Buy power from the Himalayan Accord (3 seasons). Energy +1. The two move a step closer. Never dropped.
- **Motion:** The capital region first on the grid. The megacity gets power before the provinces. Trust: Aravalli Council -4, Gangetic Union -2. Upkeep: 1 energy a season.
- **Motion:** A federal grain reserve. The federation stores grain near the capital. Trust: Gangetic Union -2. Upkeep: 1 food a season.
- **Neighbors and start relations:** Indus League (Neutral), Aravalli Council (Tense), Gangetic Union (Friendly), Himalayan Accord (Neutral).

### 7. Gangetic Union (Lucknow)

- **Id** `ganga`, short name Gangetic, leader: Convener of the Union. Seat at 26.85, 80.95. Hue suggestion 55.
- **Start trust** 36. Its first plan can start in season 6.
- **Blurb:** The populous middle Ganges plain. Wants food security and protected industry.
- **Needs:** Food (`food`, fed by food): Send Food, or research drought-resistant crops. Industry (`industry`): Industry Compact pact, Subcontinental Rail. In the charter: Protected industry, By population.
- **Pact:** Industry Compact. Industry +2. Western Seaboard trust -5. Costs 2 capital.
- **Plan:** Divert the middle river for farms (3 seasons). Food +1. Delta river flow -1, and the two fall out a step. Dropped if its food need is fully met. Backing it costs trust with Delta Republic.
- **Plan:** Raise tariffs on coastal goods (3 seasons). Industry +1. Western Seaboard trade -1. Dropped if the charter settles trade policy. Backing it costs trust with Western Seaboard.
- **Motion:** Grain price support. The federation guarantees farm prices. Trust: Malabar Ports -4. Upkeep: 1 food a season.
- **Motion:** Council seats by population. Bigger members get more say in council. Trust: Indus League -8, Himalayan Accord -6, Island Compact -6, Brahmaputra League -4.
- **Neighbors and start relations:** Yamuna Compact (Friendly), Himalayan Accord (Tense), Delta Republic (Neutral), Mahanadi Coast (Neutral), Narmada Highlands (Neutral).

### 8. Himalayan Accord (Kathmandu)

- **Id** `himal`, short name Himalaya, leader: Chair of the Accord. Seat at 27.72, 85.32. Hue suggestion 160.
- **Start trust** 40. Its first plan can start in season 4.
- **Blurb:** Mountain states of the central and eastern Himalaya. They hold the headwaters and want to sell hydropower.
- **Needs:** Hydro exports (`hydro`): Power Purchase Agreement pact, or build the Hydro Grid. Food (`food`, fed by food): Send Food, or research drought-resistant crops.
- **Pact:** Power Purchase Agreement. Hydro exports +1. You gain 1 Energy and pay 1 Capital each season.
- **Plan:** Build the Karnali dams (3 seasons). Hydro exports +1. Delta river flow -1. It falls out a step with the Delta Republic and with the Gangetic Union. Dropped if you hold run-of-river turbines. Backing it costs trust with Delta Republic and Gangetic Union.
- **Plan:** Charge a headwaters toll (3 seasons). Its relations with the Gangetic Union and the Yamuna Compact each worsen a step. Dropped if the River Flow Compact is built. Backing it costs trust with Gangetic Union and Yamuna Compact.
- **Motion:** Guaranteed hydro purchase. The federation buys Himalayan power at a fixed price. Trust: Yamuna Compact 2. Upkeep: 1 capital a season.
- **Motion:** Headwater fee. Downstream members pay for the rivers they use. Trust: Delta Republic -8, Gangetic Union -4, Yamuna Compact -4.
- **Neighbors and start relations:** Yamuna Compact (Neutral), Gangetic Union (Tense), Brahmaputra League (Neutral), Delta Republic (Tense).

### 9. Brahmaputra League (Guwahati)

- **Id** `brahma`, short name Brahmaputra, leader: Speaker of the League. Seat at 26.14, 91.74. Hue suggestion 140.
- **Start trust** 42. Its first plan can start in season 8.
- **Blurb:** The Brahmaputra valley and the northeast hills. Floods every year, and cut off from the rest by a narrow corridor.
- **Needs:** Flood protection (`flood`): Embankment Pact, Flood defense research. In the charter: Common defense force. Connection (`link`, fed by capital): Send Capital for road and rail links, or build Subcontinental Rail.
- **Pact:** Embankment Pact. Flood protection +1. Costs 2 capital.
- **Plan:** Dam the Brahmaputra gorges (4 seasons). Flood protection +1. Delta river flow -1, and the two fall out a step. Dropped if you hold run-of-river turbines. Backing it costs trust with Delta Republic.
- **Plan:** Let the Company build a freight corridor (3 seasons). Connection +1, and Company grip +1. Dropped if Subcontinental Rail is built.
- **Motion:** A federal embankment fund. Every member pays to hold back the river. Upkeep: 1 capital a season.
- **Motion:** Rail to the northeast first. New track goes through the corridor before anywhere else. Trust: Western Passes Council -4, Malabar Ports -2.
- **Neighbors and start relations:** Himalayan Accord (Neutral), Delta Republic (Tense).

### 10. Delta Republic (Dhaka)

- **Id** `delta`, short name Delta, leader: President of the Republic. Seat at 23.81, 90.41. Hue suggestion 110.
- **Start trust** 45. Its first plan can start in season 6.
- **Blurb:** The great delta, downstream of everyone. Lives or dies by river flow and flood defense.
- **Needs:** River flow (`flow`, fed by water): Send Water, or build the River Flow Compact. Flood protection (`flood`): Relief Corridor pact, Flood defense research, the Bay Cyclone Shield. In the charter: Common defense force.
- **Pact:** Relief Corridor. Flood protection +1. Costs 2 capital.
- **Plan:** Appeal to the Company for flood aid (3 seasons, repeats). Company grip +1. Dropped if its flood protection reaches 2.
- **Plan:** Campaign for delta-first water rights (3 seasons). River flow +1. Its relations with the Himalayan Accord worsen a step. Dropped if the River Flow Compact is built. Backing it costs trust with Himalayan Accord and Brahmaputra League.
- **Motion:** Minimum flow guarantee. Upstream dams must release a set flow. Trust: Himalayan Accord -8, Brahmaputra League -4.
- **Motion:** Federal flood fund. Every member pays into flood defense. Trust: Indus League -2, Aravalli Council -2. Upkeep: 1 capital a season.
- **Neighbors and start relations:** Gangetic Union (Neutral), Himalayan Accord (Tense), Brahmaputra League (Tense), Mahanadi Coast (Neutral).

### 11. Mahanadi Coast (Bhubaneswar)

- **Id** `mahanadi`, short name Mahanadi, leader: Governor of the Coast. Seat at 20.3, 85.82. Hue suggestion 85.
- **Start trust** 40. Its first plan can start in season 7.
- **Blurb:** The eastern coast and its mineral belt. Burns coal for industry and braces for each cyclone season.
- **Needs:** Cyclone protection (`storm`, fed by capital): Send Capital for cyclone shelters, or research flood defense, or build the Bay Cyclone Shield. Industry (`industry`): Minerals Compact pact, Subcontinental Rail. In the charter: Protected industry.
- **Pact:** Minerals Compact. Industry +2. Delta Republic trust -4. Costs 2 capital.
- **Plan:** Expand the coal plants (3 seasons). Industry +1. Its relations with the Delta Republic worsen a step. Dropped if the Desert Solar Grid is built. Backing it costs trust with Delta Republic.
- **Plan:** Buy cyclone shelters from the Company (3 seasons, repeats). Cyclone protection +1, and Company grip +1. Dropped if you hold flood defense.
- **Motion:** Coal credits for the mineral belt. Coal-fired industry pays no federal levy. Trust: Delta Republic -6, Coromandel Coast -2.
- **Motion:** A federal cyclone warning network. The federation runs radar and shelters on the coast. Upkeep: 1 capital a season.
- **Neighbors and start relations:** Gangetic Union (Neutral), Delta Republic (Neutral), Narmada Highlands (Friendly).

### 12. Narmada Highlands (Bhopal)

- **Id** `narmada`, short name Narmada, leader: Steward of the Highlands. Seat at 23.26, 77.41. Hue suggestion 95.
- **Start trust** 32. Its first plan can start in season 5.
- **Blurb:** Central forests and plateau. Guards its self-rule and the river that rises in its hills.
- **Needs:** Autonomy (`autonomy`): Forest Charter pact. In the charter: Loose union, Local militias, Managed movement. Water (`water`, fed by water): Send Water.
- **Pact:** Forest Charter. Autonomy +1.
- **Plan:** Raise the Narmada dams (4 seasons). Water +1. The Western Seaboard trusts you 4 less, and the two fall out a step. Dropped if its water need is fully met. Backing it costs trust with Western Seaboard.
- **Plan:** Close the forests to mining (3 seasons). Autonomy +1. Mahanadi industry -1. Dropped if you sign its Forest Charter. Backing it costs trust with Mahanadi Coast.
- **Motion:** Forest self-rule. Forest councils decide what is cut and mined. Trust: Mahanadi Coast -4, Western Seaboard -2.
- **Motion:** Dam water stays upstream first. Highland reservoirs fill before any release. Trust: Western Seaboard -8.
- **Neighbors and start relations:** Aravalli Council (Neutral), Gangetic Union (Neutral), Mahanadi Coast (Friendly), Western Seaboard (Tense).

### 13. Western Seaboard (Mumbai)

- **Id** `seaboard`, short name Seaboard, leader: Chair of the Seaboard Assembly. Seat at 19.08, 72.88. Hue suggestion 230.
- **Start trust** 44. Its first plan can start in season 4.
- **Blurb:** The Konkan and Gujarat coasts and their finance hub. The Company courts its banks.
- **Needs:** Trade (`trade`): Finance Accord pact. In the charter: Open market, Open borders. Energy (`energy`, fed by energy): Send Energy, or build the Desert Solar Grid.
- **Pact:** Finance Accord. Trade +2. You gain 1 Capital each season. Gangetic Union trust -5.
- **Plan:** Float bonds with the Company (3 seasons, repeats). Company grip +1. Dropped if its trade need reaches 2.
- **Plan:** Declare free ports (3 seasons). Trade +1. It trusts you 4 more if you hold its Finance Accord, 4 less if not. Never dropped.
- **Motion:** A federal bank on the western coast. The federation keeps its treasury in the port city. Trust: Yamuna Compact -4, Gangetic Union -2.
- **Motion:** Ports first on the grid. Ports get power before inland towns. Trust: Gangetic Union -4, Aravalli Council -2. Upkeep: 1 energy a season.
- **Neighbors and start relations:** Lower Indus Ports (Neutral), Aravalli Council (Neutral), Narmada Highlands (Tense), Malabar Ports (Friendly).

### 14. Malabar Ports (Kochi)

- **Id** `malabar`, short name Malabar, leader: Harbor Master of the Ports. Seat at 9.93, 76.27. Hue suggestion 270.
- **Start trust** 46. Its first plan can start in season 7.
- **Blurb:** Port cities of the southwest coast. Wants open trade and food it cannot grow on its narrow coast.
- **Needs:** Trade (`trade`): Spice Route Pact. In the charter: Open market, Open borders. Food (`food`, fed by food): Send Food.
- **Pact:** Spice Route Pact. Trade +2. Island Compact trust -5.
- **Plan:** Undercut the Island Compact's ports (3 seasons). Trade +1. Island Compact trade -1, and the two fall out a step. Dropped if the charter settles trade policy. Backing it costs trust with Island Compact.
- **Plan:** Form a shipping bloc with the Western Seaboard (4 seasons). The two become allies. If neither is a member, each trusts you 6 less: they have each other. If one is a member, the other trusts you 8 more. Never dropped.
- **Motion:** Free ports charter. No duties at member ports. Trust: Gangetic Union -6, Island Compact -4.
- **Motion:** Coastal food price support. The federation keeps rice cheap on the coast. Trust: Coromandel Coast -2. Upkeep: 1 food a season.
- **Neighbors and start relations:** Western Seaboard (Friendly), Coromandel Coast (Neutral), Island Compact (Rival).

### 15. Coromandel Coast (Chennai)

- **Id** `coromandel`, short name Coromandel, leader: Chair of the Coast Council. Seat at 13.08, 80.27. Hue suggestion 300.
- **Start trust** 38. Its first plan can start in season 5.
- **Blurb:** The southeast coast. Downstream of you on the Kaveri, and short of the power its factories need.
- **Needs:** Water (Kaveri) (`water`, fed by water): Send Water, Kaveri Release pact, or research desalination. Energy (`energy`, fed by energy): Send Energy.
- **Pact:** Kaveri Release. Water +1. You give 1 Water each season.
- **Plan:** Press its claim on the Kaveri (3 seasons). Water +1. You lose 2 Water to the release. Dropped if you sign the Kaveri Release.
- **Plan:** Send trawlers into the Island Compact's waters (3 seasons). Island Compact protection at sea -1, and the two fall out a step. Dropped if the charter settles defense. Backing it costs trust with Island Compact.
- **Motion:** A federal Kaveri tribunal. A federal court sets the Kaveri release each season. Upkeep: 1 water a season.
- **Motion:** A southern power grid. The federation links the southern coasts' power. Trust: Malabar Ports -2. Upkeep: 1 energy a season.
- **Neighbors and start relations:** Malabar Ports (Neutral), Island Compact (Tense).

### 16. Island Compact (Colombo)

- **Id** `island`, short name Island, leader: Secretary-General of the Compact. Seat at 6.93, 79.86. Hue suggestion 250.
- **Start trust** 33. Its first plan can start in season 6.
- **Blurb:** The island and its harbors. Lives by trade and needs its sea lanes kept safe.
- **Needs:** Trade (`trade`): Harbor Pact. In the charter: Open market. Protection at sea (`security`, fed by capital): Send Capital for patrol boats. In the charter: Common defense force.
- **Pact:** Harbor Pact. Trade +2. Malabar Ports trust -5.
- **Plan:** Lease a harbor to the Company (3 seasons, repeats). Company grip +1. Dropped if its protection at sea reaches 2.
- **Plan:** Close its fishing waters (3 seasons). Protection at sea +1. Its relations with the Coromandel Coast worsen a step. Dropped if it makes peace with the Coromandel Coast. Backing it costs trust with Coromandel Coast.
- **Motion:** A federal coast guard. The federation patrols the island's sea lanes. Trust: Coromandel Coast -4. Upkeep: 1 capital a season.
- **Motion:** Duty-free harbors. Island harbors charge no federal duty. Trust: Malabar Ports -8.
- **Neighbors and start relations:** Malabar Ports (Rival), Coromandel Coast (Tense).

### Shared projects and research

| Project | Partners at trust 45 | Capital | Does | Catch |
| --- | --- | --- | --- | --- |
| Himalayan Hydro Grid | Himalayan Accord | 5 | Energy +2 a season. Himalayan hydro +2 and trust +8, Yamuna energy +1 | Unless you hold run-of-river turbines: Delta flow -1 and trust -10, Gangetic trust -4, Himalaya and Delta fall out a step |
| River Flow Compact | Himalayan Accord, Delta Republic | 4 | Delta flow +2 and trust +8, the two move a step closer | Unless run-of-river: Himalayan hydro -1, trust -6 |
| Indus Water Treaty | Indus League, Lower Indus Ports | 4 | Indus water +1, Lower Indus flow +2, trust +6 each, the two move a step closer | You give 1 Water a season |
| Desert Solar Grid | Aravalli Council | 5 | Energy +1 a season. Aravalli energy exports +2 and trust +8, Yamuna and Seaboard energy +1 | Mahanadi trust -4 |
| Bay Cyclone Shield | Mahanadi Coast, Delta Republic | 5 | Mahanadi cyclone protection +2, Delta flood +1, trust +5 each | None |
| Subcontinental Rail | Any two powers | 7 | Capital +2 a season. Brahmaputra connection +1, Passes trade routes +1, Gangetic and Mahanadi industry +1, all trust +2 | None |

| Research | Does |
| --- | --- |
| Drought-resistant crops | Food +2 a season, failed monsoons hurt half as much. Himalayan, Gangetic, and Yamuna food +1 |
| Desalination | Water +2 a season. Coromandel and Aravalli water +1 |
| Run-of-river turbines | The Hydro Grid and the Flow Compact spare the other river state. Ends the Karnali and gorge dam plans |
| Flood defense | Delta flood +2 and trust +6, Brahmaputra flood +1, Mahanadi cyclone protection +1 |
| Civil defense doctrine | Battle odds +20%, winning no longer breeds resentment. Western Passes protection +1 |

### The charter for sixteen

| Question | Option | Trust | Need points |
| --- | --- | --- | --- |
| How strong is the center? (season 3) | Strong center | Gangetic +8, Yamuna +8, Delta +4, Seaboard +4, Indus -10, Himalaya -6, Narmada -6, Passes -6, Island -4 | None |
| | Loose union | Indus +8, Himalaya +6, Narmada +6, Passes +6, Island +4, Gangetic -6, Yamuna -6 | Indus autonomy +2, Narmada autonomy +1 |
| Open market or protected industry? (season 6) | Open market | Malabar +8, Seaboard +8, Island +6, Lower Indus +6, Gangetic -10, Mahanadi -6 | Malabar, Island, and Lower Indus trade +1. Gangetic industry -1 |
| | Protected industry | Gangetic +10, Mahanadi +8, Malabar -8, Seaboard -8, Island -4 | Gangetic and Mahanadi industry +1. Malabar trade -1 |
| Who defends the federation? (season 9) | Common defense force | Delta +6, Island +6, Passes +4, Brahmaputra +4, Gangetic +4, Indus -8, Narmada -6 | Delta and Brahmaputra flood +1, Island and Passes protection +1 |
| | Local militias | Indus +8, Narmada +6, Himalaya +4, Passes -4 | Indus and Narmada autonomy +1 |
| How is federal revenue shared? (Act 3, season 3) | Equal shares | Indus +6, Himalaya +6, Passes +4, Narmada +4, Brahmaputra +4, Island +4, Malabar +2, Gangetic -8, Yamuna -6 | Himalayan food +1, Brahmaputra connection +1 |
| | By population | Gangetic +8, Yamuna +6, Delta +4, Seaboard +2, Indus -6, Himalaya -6, Brahmaputra -4, Island -4 | Gangetic industry +1 |
| Open borders or managed movement? (Act 3, season 6) | Open borders | Malabar +6, Seaboard +6, Delta +4, Gangetic +2, Island +2, Indus -6, Narmada -4 | Malabar and Seaboard trade +1 |
| | Managed movement | Indus +6, Himalaya +4, Narmada +4, Seaboard -4, Malabar -4 | Indus and Narmada autonomy +1 |

The Brahmaputra League is left out of the borders article on purpose: migration in the northeast is a live ethnic issue. The Delta Republic keeps its +4 for open borders from the five-power cast. Reviewers should look at both.

### How each plays, from the sim

Share of 400 adviser games in which the power had joined when Act 2 began, was a member at the end, and had pledged at the end.

| Power | Joined by Act 2 | Member at end | Pledged at end | Why |
| --- | --- | --- | --- | --- |
| Indus League | 81% | 99% | 87% | Its autonomy comes cheap from the pact and the charter |
| Lower Indus Ports | 49% | 97% | 79% | Its rival upstream usually joins first |
| Western Passes Council | 64% | 98% | 88% | Low trust, but Capital buys its protection |
| Aravalli Council | 46% | 91% | 70% | Short of Water, like everyone |
| Yamuna Compact | 74% | 97% | 86% | Two resource needs, easy to feed |
| Gangetic Union | 17% | 93% | 44% | Industry is hard to raise, and its pact angers the Seaboard |
| Himalayan Accord | 69% | 96% | 80% | |
| Brahmaputra League | 46% | 90% | 54% | Flood protection comes only from pacts, research, and the charter |
| Delta Republic | 51% | 90% | 67% | Every dam upstream cuts its flow |
| Mahanadi Coast | 55% | 94% | 63% | |
| Narmada Highlands | 40% | 94% | 69% | Low trust |
| Western Seaboard | 94% | 96% | 82% | Rich and friendly, and the Company courts it |
| Malabar Ports | 71% | 95% | 77% | |
| Coromandel Coast | 32% | 90% | 38% | The Kaveri costs you Water, and the Island Compact quarrels with it |
| Island Compact | 33% | 84% | 36% | Its rival Malabar usually joins first |

### Deviations from the approved list

- None in names, seats, or needs. Two labels are clarified: "Water (Kaveri)" for the Coromandel Coast and "Connection" for the Brahmaputra League's rail and trade need.
- The Coastal League's content is split. Malabar Ports keeps the trade pact shape, with the Island Compact as the power it angers. The Western Seaboard takes "Declare free ports". The Maritime Bloc is now a shipping bloc between Malabar Ports and the Western Seaboard.
- The Indus League's old rivalry with the Gangetic Union is gone, because Lahore and Lucknow are not neighbors. Its rival is now the Lower Indus Ports, downstream on the same river. This keeps the sharpest pair inside one river basin rather than across a present-day border. Reviewers should still see it.

### In the UI

The page reads every power from this table; see `docs/acts.md` section 20. Map positions come from `lat` and `lon` through `tools/build_map.py`, colors from `hue`, the dossier subtitle from `title`. Only the portrait look is keyed by id in the page, with a fallback for a new id.
