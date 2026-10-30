# The Great War: Field Manual

This is the player handbook for The Great War. It covers how the event works from your side: your life and your nation, how wars start, how justice works, how you earn and spend money, what you can fight with, and where to get help.

It's split into five modules, the same five the Discord is split into, so if you've got a question about trade you know which channel to ask in. Section numbers match the staff copy. If a number skips, that part was staff only.

Numbers in here are the current settings. Some will move a little during playtesting, and if they do we'll say so in announcements. Death is permanent. Read Module 1 and Module 3 before your first session, at the very least.

## Module 1: The Event and Your Life

### 1.1 The event and first principles

#### 1.1.1 The vision

Around 300 of you are citizens of rival WW1 nations on a shared, pre-built map of Europe. You start with almost nothing. Between you, you build your nation into a war machine: gathering, producing, paying tax, researching and pushing a living front line. Death is permanent. Wars start from real incidents and real diplomacy, not from a menu. A nation rises on its economy and its discipline, and it falls when its capital is overrun.

#### 1.1.2 The platform

- Minecraft 1.20.1 on Forge 47.4.x, running Java 17.
- The event runs on its own modpack: custom-made mods built for The Great War, plus a set of performance mods.

#### 1.1.3 Sessions and the end of the event

The event runs over a set number of sessions. Each one sits inside the server's daily opening hours, which is the window when the event is live.

The event ends after the final session. If the players as a whole want it over sooner, staff can call it early. There's no in-game vote for this; staff make the call.

#### 1.1.4 Deadlines and the web companion

Every deadline in this manual is flat real time. That covers responding to a charge, agreeing a trial time, war preparation, the absent Leader handover and cooldowns. 24 h means 24 h from the moment it starts, whether the server is open or not. No extensions, no excuses.

That's fair because once the website is live, anything you can respond to in-game you can also do there (section 5.4). Not being able to get on the server is never a reason to miss a deadline. The only things that have to happen in-game are the physical ones: fighting, sieges, donating, and the trial itself. That's why trial times have to fall inside opening hours (3.5.6).

#### 1.1.5 First principles

These are the rules the whole event is built on. They don't bend.

1. Perm-death is permanent. Nothing brings a dead player back into the war.
2. No kill tickets. The game reads every kill and decides what it means (section 3.1). You never file a report to get a kill judged.
3. The game is the judge. Staff only step in for three things: approving war declarations, ruling on disputed incidents or broken trial rules, and fixing genuine bugs (reviving someone killed by one, for example). Everything else, from consequences and territory to money, justice and a nation collapsing, is decided by the game from what's actually happening.
4. Only the living count. Siege strength, population, rosters, tax base and scout intel all count living players only.
5. The server decides. Kills, captures, payments, verdicts and permissions are all settled by the server, and your screens show you what it holds.
6. Nothing is lost. Everything saves, and a restart in the middle of the event loses nothing.
7. The interface is a game, not a spreadsheet. Every system has its own screen opened by a key, laid out in the same tech tree style. The pause screen is still plain vanilla.
8. Freedom plus consequences. The game rarely stops you doing something. It makes what you do mean something instead. There are two hard blocks: allies can't damage each other, and no outcome ever depends on someone being unreachable (rule 9).
9. Nobody wins by going quiet. Every decision a nation or player has to make comes with a deadline and a safe default for when nobody answers, and the default is picked so silence can't be used as a weapon. An unanswered charge, for example, kicks the accused out of their nation automatically. It never starts a war.

### 1.2 Nations, membership, life and death

#### 1.2.1 The nations

There's a fixed set of about six historical WW1 European powers. Nobody can found a new nation during the event. The planned roster is the British Empire, France, Germany, Russia, Italy and Austria-Hungary.

Each nation has its own name, colour, capital region and starting regions. Staff pick each nation's founding leadership (the Leader and the succession order, section 2.1) before the event starts.

#### 1.2.2 Membership and assignment

You belong to exactly one nation, or you're nationless (an outlaw, or a citizen of a nation that has dissolved). If you're On Trial (3.5.5), you're suspended from your nation for the duration.

When you first join, you go into the nation with the fewest living members. Ties are broken at random. You can ask for a particular nation instead, and you'll get it as long as it isn't currently the largest. If it is, you're balanced into the smallest like everyone else.

Each nation also has a cap on living members (section 1.3).

#### 1.2.3 Leaving, expulsion and rejoining

- Leadership can expel you if they hold the Membership permission (section 2.1). Being expelled only makes you an outlaw if it follows a crime, which is exile (3.5.4). A plain expulsion with no open case leaves you nationless, but not outlawed.
- Exile comes with a cooldown. You have to clear your exile debt first (3.5.8). After that any nation's leadership can admit you, but your old nation can't take you back for 72 h. "Exile Bob and take him straight back" doesn't work.
- Repeat exiles get worse. Every time the same player is exiled, their exile debt doubles, and so does the wait before the old nation can take them back (72 h, then 144 h, and so on). Exile can't be used forever as a way to buy a killer out (3.5.3).

#### 1.2.4 Life, death and perm-death

From the moment you first join, you're either alive or dead. Die from anything at all and you're marked dead, taken off your nation's living roster and out of the war for good. Your record (money, nation history, debt) is kept. The dead never count towards anything.

Once dead, you become a spectator and can't switch yourself back to survival. Only an admin revive brings someone back, and staff only do that for genuine bugs. Your death is saved the instant it happens, so a crash won't undo it. Logging out at low health doesn't heal you, and it won't save you from a death that has already landed.

#### 1.2.5 Nation lifecycle

A nation lives as long as it holds its capital. It dissolves when its capital core is captured (section 3.3) or its treasury fails for good (section 4.3). When a nation dissolves, its regions go neutral and its members become nationless. All its wars, alliances, incidents, charges, proposals, trades and jobs end, any money tied up in them is refunded, and nobody new can join it.

Dissolution is permanent. Staff can restore a nation, but only to correct a mistake.

### 1.3 Citizenship: leaving, joining, defecting

Leaving is your right. You can leave your nation at any time from Me, after a confirmation, and you become nationless. This is the check on bad leaders. A bad Leader bleeds people.

If you leave while you have an open case (any justice case or demand against you), you become an outlaw and the case follows you (3.5.8).

- Joining works by request. If you're nationless, you ask to join, and someone in that nation's leadership with Membership accepts or refuses.
- Going back to your old nation means a 72 h wait, which doubles for repeat exiles (1.2.3).
- No defecting to the enemy. For 72 h after you leave, you can't join a nation that is at war with your old one or preparing for war with it.
- The cap on living members per nation (1.2.2) is the average nation size plus 20%. One side can't snowball by soaking up everyone.
- If you hold a leadership seat, you lose it when you leave.

### 1.4 Player roles

Roles have been replaced by classes and specialisations. Your class decides how you fight (4.6.6) and your specialisation decides how you earn (4.6.7).

## Module 2: Leading a Nation

### 2.1 Nation governance: the Leader and the 8 seats

Think Supremacy 1914, Hearts of Iron IV and Civilization. One Leader plays the country. Leadership is the Leader plus a small cabinet, and everyone else is a citizen (section 1.3) who never has to touch the business of government unless they want to.

#### 2.1.1 The Leader

Each nation has one Leader, who holds every permission. Only the Leader can manage the seats, set the succession order and approve large treasury moves (2.1.4). Staff appoint each nation's founding Leader before the event starts.

#### 2.1.2 The 8 seats

The Leader fills up to 8 leadership seats. Each seat has a name and whatever permissions the Leader gives it. Seats start with default names, and the Leader can rename them. The name is just for show.

| Default seat name | Covers |
|---|---|
| Chancellor | Treasury and tax |
| Foreign Secretary | Mail, proposals, trade |
| War Minister | War and peace, orders |
| Justice Minister | Justice |
| Science Minister | Research |
| Home Secretary | Membership |
| Officer (×2) | Nothing until given permissions |

You can hold one seat at most.

This is the full list of permissions. Every leadership action falls under exactly one of them.

- **Read mail:** see the nation's diplomatic mailbox (section 2.3).
- **Write mail & proposals:** send letters, and send and answer alliance, peace and call to arms proposals (sections 3.2 and 2.3).
- **War:** request war, go to war now, accept or decline calls to arms, propose or accept peace (section 3.2).
- **Trade:** propose and answer trades (section 4.5).
- **Treasury & tax:** set tax, spend the treasury, post rewards paid from the treasury (sections 4.1 and 3.5.9).
- **Justice:** demand justice, answer demands, schedule and judge trials, set auto-replies (section 3.5).
- **Research:** open and lock tech nodes (section 4.2).
- **Orders & jobs:** post rallies and jobs for citizens (section 2.5).
- **Membership:** admit and expel members (section 1.3).
- **Press:** publish articles in the Daily Front (section 2.4).

Permissions are checked live on every screen and every action. Lose a seat and you lose its screens and its mail on the spot.

#### 2.1.3 Succession and the absent Leader

The seats double as the succession order, seat 1 first. The Leader sets that order.

If the Leader dies, the first living seat holder becomes Leader straight away and everyone is told. If no seats are filled, leadership passes to the longest serving living member.

If the Leader has been offline for 48 h, the first seat holder who has been online in the last 24 h becomes Regent and holds the Leader's powers until the Leader comes back. A Leader who is On Trial abroad counts as absent.

A seat holder who dies, leaves, is expelled, is outlawed or goes On Trial loses the seat immediately.

#### 2.1.4 Leader-only safeguards

Any single trade, gift or spend worth more than 25% of the treasury needs the Leader's approval. It waits in the Leader's alert row until someone deals with it. A Regent can approve it too.

Only the Leader manages seats, permissions, seat names and the succession order.

#### 2.1.5 Who gets told what

Cabinet notifications go to the Leader and to the seats whose permissions cover them. Nobody else. As a citizen you only hear about things that concern you personally, your nation's orders (section 2.5) and the newspaper (section 2.4).

### 2.2 The interface: the Leader's view and the citizen's view

Leadership plays the strategy game. Citizens play Minecraft with a purpose. Each side only sees its own view. Everything uses plain words, and every screen follows the same tech tree style.

#### 2.2.1 The citizen's view: the War Office (key P)

Press P. The War Office is a set of tiles and nothing else.

- **Me** shows your money, your nation and your status (clean, on trial or outlaw), plus anything waiting on you personally. For example: "Germany demands justice for your kill: [Pay $X myself] [Leave it to my nation]". It also shows the four rules:

  - Kill enemies in a war: fine.
  - Kill anyone else: your nation answers for it, and may kick you out.
  - Kill your own people: you stand trial, or flee and become an outlaw.
  - Red name means outlaw. Anyone can kill them, often for a reward.

- **Orders** shows what your leadership wants right now (rallies and jobs, section 2.5) and the standing default work.
- **The Daily Front** is the newspaper (section 2.4).
- **Wanted** lists outlaws, rewards and upcoming trials, and lets you post a reward of your own.
- **Map** is the war map (section 3.4).

Leave nation is inside Me, with a clear confirmation of what leaving means (section 1.3).

#### 2.2.2 The Leader's view: the Cabinet (Leader and seat holders only)

If you've played HOI4, Civ or Supremacy this will feel familiar. You only see the parts your seat's permissions cover.

- **Top bar:** treasury, tax rate, living population, regions held, wars and preparations.
- **Alert row:** one icon per thing that needs you, each with a countdown. New mail, a demand for justice, a trade or alliance offer, a call to arms, a peace offer, a region under siege, a Leader approval (2.1.4) and any deadline about to run out. Click an icon and you're taken straight to the decision.
- **Nations ribbon:** every nation's flag with an icon for where you stand with them (neutral, allied, preparing or at war). Click a flag to open the country panel. It shows their Leader and seats, your relationship and its history, recent events between you, and the actions *Send letter, Propose trade, Offer alliance, Call to arms, Request war, Offer peace*.
- **Mailbox** (section 2.3): letters and formal proposals. Proposals come with their own buttons.
- **Trade** (section 4.5): the two column deal screen.
- **Justice:** your nation's cases, meaning treason, demands made and received, and trials. It's everything in section 3.5 laid out as cards with buttons.
- **Government:** seats and permissions, succession order, tax, auto-replies, research focus.
- **Citizens:** the roster (living or dead, seat, recent activity), orders and jobs (section 2.5) and the public treasury log.

#### 2.2.3 Plain words

This manual sometimes uses the formal term. The screens use the plain one.

| In this manual | On your screen |
|---|---|
| Incident | Peacetime kill |
| Charge | Demand justice |
| Settle or settlement | Pay compensation |
| Exile | Kick out |
| Refuse | Protect him |
| Standing orders | Auto-replies |
| Dispute | Report to staff |
| Ground or reason for war | Reason |

#### 2.2.4 Defaults that hide the machinery

Every nation starts with auto-replies switched on: always demand justice for peacetime kills, pay compensation for a first time offender, and kick out a repeat offender. Most peacetime kills get sorted without anyone clicking anything.

#### 2.2.5 Interaction rules

- Any button that can't be undone or that costs money shows a one line confirmation of exactly what will happen before it goes through.
- Trial times work like a meeting invite, with **Accept** and **Suggest another time**.
- You can always see where you stand at a glance. Your money is on the HUD, your nation and status are on your nameplate and in the tab list, and a badge appears when something is waiting for you.

### 2.3 Mail and proposals

Borrowed from Supremacy 1914 and Civilization.

Letters are free text messages from one nation to another, or to several at once. A seat with *Write mail* writes them, and every seat with *Read mail* on the receiving end can read them. Each letter is signed with the writer's name and seat.

Proposals are letters with a decision attached: alliance, peace, call to arms and trade (justice demands work the same way, see section 3.5). The receiver answers with buttons: **Accept**, **Counter** or **Reject**. Counter only shows up where it makes sense, which mostly means trades. Proposals expire after 24 h (1.1.4).

Mail arrives in the Cabinet Mailbox and in the alert row, and unread mail gets a badge.

Each nation can send 10 letters and 10 proposals an hour. Letters max out at 1,000 characters. Mail older than 7 days gets archived. You can still read it, it just stops cluttering the inbox.

All mail is logged and staff can read it (section 5.1). Write accordingly.

### 2.4 The Daily Front

The newspaper, modelled on Supremacy's Daily European. It's the one thing everyone reads. It has its own screen in both the War Office and the Cabinet, and a short headline pops up when a new edition comes out.

A daily edition goes out at the start of each session, and breaking news runs live for the big moments.

The paper writes stories on its own for:

- wars requested, declared and ended
- alliances formed and broken, and sides switched
- regions captured and nations dissolved
- new Leaders
- trials and verdicts, executions especially
- the most wanted outlaws and the biggest rewards
- large trades
- each nation's casualties for the day

A seat with *Press* can publish 1 article per day for their nation. Official statements, propaganda, threats, whatever you like. An article is a title plus up to 1,500 characters, signed with the nation and the writer.

The paper keeps the last 7 days. Staff can delete any article (section 5.1).

### 2.5 Orders and jobs

Citizens should feel like real people, not NPCs. Leadership gives you direction, and in return you get a purpose and a wage.

#### 2.5.1 Rallies

A rally is a map marker, a time and one line of text ("Defend Calais, 19:00"). You get a toast and a waypoint, and the rally stays in Orders until it expires.

#### 2.5.2 Jobs

A job is a task with a reward, paid from the treasury once the game confirms you've done it. Jobs only cover things the game can actually check:

- donate a set amount of a resource to a tech node (paid per item)
- a reward for each enemy killed during a live war, either in a given region or anywhere
- be in a region during a siege (paid per minute you're there)
- fortify a region (see below)

The budget is set aside when the job is posted, and whatever's left goes back to the treasury when the job ends.

#### 2.5.3 Fortify a region

The Leader, or a seat with *Orders & jobs*, posts a Fortify job by picking one of the nation's own regions, a block budget and a rate of pay per block. It pays for sandbags, planks, stone, cobblestone, bricks and barbed wire placed in that region. The pay goes to whoever placed the block, but only if the block is still standing 10 minutes later. If you break your own block inside those 10 minutes, it doesn't count.

You're limited by the job's budget and by 256 paid blocks per player per day. Builders get 25% more per block (4.6.7).

Sandbags and barbed wire come from Fields of 1918, and they're the only blocks from that mod you can place. The recipes:

| Recipe | Output |
|---|---|
| 4 sand + 1 string | 4 sandbags |
| 2 iron nuggets + 2 string | 4 barbed wire |

Both count for Fortify jobs. Barbed wire slows anyone walking through it (Slowness III while you're in it) and hurts a little (half a heart every 1.5 s). Anyone means anyone, your own side included, so think about where you put it.

#### 2.5.4 Limits and pay

Every job has a total budget, and there are daily caps per job and per nation on top. Every payout goes in the public treasury log, so citizens can see exactly who's getting paid.

#### 2.5.5 Default work

When there are no orders, Orders shows the standing default: donate to the open research, gather, defend home. You're never left with nothing to do.

#### 2.5.6 Who can post

Seats with *Orders & jobs* post rallies and jobs. Spending treasury money on a job also needs *Treasury & tax*, or the Leader's approval.

## Module 3: War, Land and Justice

### 3.1 Combat, consequences and incidents

Everything else in this event hangs off this section, so read it properly. The game doesn't stop you hurting other players, with one exception: allies can't hurt each other. Anyone else, you can shoot. What changes is what the kill means afterwards, and that depends on who you killed and how your nation stood with theirs at the time.

#### 3.1.1 The consequence table

Every kill gets checked against this table, whatever killed them (3.1.6). What counts is the relationship at the moment of the killing blow, not what it was when the fight started.

| Who you killed | Can you hurt them? | What the kill means |
|---|---|---|
| An enemy, war is live | Yes | A legitimate act of war. Nothing happens to you. |
| An enemy, war still in preparation (3.2.2) | Yes | An incident (3.1.3). Their nation may also end preparation early (3.2.2). |
| Someone in your own nation | Yes | Treason. Your own nation charges you (section 3.5). |
| Someone in an allied nation | No | You can't. The alliance has to be broken first (3.2.4). |
| Anyone from a nation you're neither at war with nor allied to | Yes | An incident (3.1.3). |
| An outlaw | Yes | Lawful. No consequence, and you collect any bounty on them (3.5.9). |
| A nationless player (their nation dissolved, not an outlaw) | Yes | No consequence. |
| A player On Trial (3.5.5) | Yes | Special rules protect trials. See 3.5.5. |

Damage that doesn't kill is never a crime. Only kills count, so clipping a friend with splash damage won't flag anyone.

#### 3.1.2 Who started it: self-defence

The game knows who shot first. Hits between the same two players count as one fight as long as there's never more than 60 seconds between them.

Whoever dealt the first damage is the aggressor. If the aggressor dies, nothing is opened against the player who killed him. Defending yourself is never a crime.

In a group fight, each kill is judged on whether that killer, or his side, was hit first by the victim's side within that 60 second window. Messy cases like baiting or plain confusion go to staff as a dispute (3.1.8). The game doesn't guess.

It also means baiting doesn't work. Run in, shoot first and get yourself killed, and you're the aggressor. Your nation gets nothing out of it.

#### 3.1.3 Incidents

On screen this is called a **peacetime kill**. One is opened when you kill a member of another nation you're not at war with, and you weren't defending yourself. Each incident belongs to one killer and one victim nation.

- Sprees merge. All of one player's kills against one nation within 30 minutes become a single incident, and the price to settle it (3.5.3) goes up with the number of kills.
- Only the victim's own nation can act on it. Its allies can't.
- The victim nation can forgive. It can choose not to charge, or drop the incident at any time, and that closes it.
- If the killer dies, the incident closes. Perm-death is already the worst punishment there is, and nobody owes anything for a dead man.
- If war between the two nations goes live, every open incident between them closes. The war takes over.

#### 3.1.4 The incident flow in one paragraph

Bob (Britain) kills Hans (Germany) at peace. An incident opens. Germany has 24 hours to charge Bob (1.1.4). If it does, Britain has 24 hours to respond, and it gets four choices: send Bob to trial in Germany, pay the fixed compensation, kick Bob out, or protect him. Protecting him lets Germany request war, which staff still have to approve (3.2.2). If Britain doesn't answer in time, Bob is kicked out automatically. Silence never starts a war. The full detail on charges, trials and compensation is in section 3.5.

#### 3.1.5 What you see and do if you're accused

When your nation is charged over your kill, you get a toast and a case on the Me tile of your War Office, with two buttons:

- **Pay it myself.** You pay the compensation from your own wallet (if it's available, see 3.5.3) and the case closes. Your nation pays nothing.
- **Leave it to my nation.** You can add a one-line statement if you want ("he shot first, check it"), and your leaders will see it.

If you ignore it, your leaders see "no response" and make the call without you. Your nation doesn't need to track you down to deal with you. Kicking you out is always an option for them, so going quiet won't trap your nation, and it won't save you either.

#### 3.1.6 What counts as your kill

You're credited with a kill however you did it:

- direct hits
- projectiles (the shooter)
- explosives and TNT you placed (the owner)
- potions and lingering clouds (the thrower)
- pets (the owner)
- fire (whoever lit it)
- artillery

The relationship is read when the hit lands, not when you fire. A shell fired during a war that lands after peace is signed counts as a peacetime kill. Time your barrages. The ally block (3.1.1) covers all of these too, so you can't hurt allies with artillery or fire either.

If you find a way of killing someone that the game doesn't credit to you, report it to staff. Using it on purpose is an exploit and will be treated as one.

#### 3.1.7 Killing yourself and dying to the world

If you die to the world (falling, drowning, fire nobody started) or kill yourself, there's no table to run, but the death is still permanent (section 1.2). If you cause someone else's "accident", say by knocking them into lava, that's your kill and the table runs as normal.

#### 3.1.8 Disputes

On screen this is **Report to staff**. Either nation in an incident can dispute it ("it was self-defence and the game missed it", "he baited us"). A dispute pauses the incident's deadlines while staff look at the full fight log: who hit whom, when, with what and where. Staff then either uphold the incident, void it, or reverse it so the other side becomes the aggressor.

Most incidents never get here, because the first damage rule sorts out the ordinary cases on its own. There's a limit on how many open disputes a nation can have at once, so don't use it to stall.

### 3.2 War and diplomacy

Any two nations are in one of four states: neutral (the default), allied, war in preparation, or at war. If you've played Hearts of Iron IV this will feel familiar. Wars need a reason, they're announced in advance, and allies get pulled in through calls to arms.

#### 3.2.1 Reasons for war

Your nation's leadership can request war on another nation in these cases:

- **After a refused charge** (3.1.4, 3.5.4). The other nation protected someone who killed one of yours. This is the usual route.
- **After a harassment campaign.** If one nation's members cause 3 incidents against your nation within 24 hours, you can request war straight away without charging anyone first. Paying for each kill doesn't make a campaign safe.
- **After an assassination.** A member of another nation kills your Leader or one of your seat holders at peace, and it wasn't self-defence. You can request war directly with no charge step (3.5.3).
- **Any other reason.** You can request war with no incident behind it at all. Staff judge whether the reason you give is acceptable, the same as any other request.

#### 3.2.2 Declaring war: staff approval and preparation

1. **Request.** Someone with the war permission submits a request naming the target and the reason. The target's leadership is told a request is pending.
2. **Staff approval.** Staff approve or deny it, and both sides see the reason. Staff aren't picking a winner. They're only checking the war is legitimate and not abuse. If staff haven't got to it yet, the request just waits. It never approves itself.
3. **Preparation, 24 hours** (1.1.4). Both nations are told war is coming and exactly when it goes live. No killing between the two during this time. A kill between them is an incident, and if the victim didn't start that fight (3.1.2), the victim's nation can end preparation on the spot. The war goes live immediately with no staff step, since it's already approved. So jumping the gun just throws away your own head start. Preparation gives both sides time to gather, dig in and call allies, and it means nobody gets attacked out of nowhere.
4. **War is live.** Kills between the two nations carry no consequence and sieges become possible (section 3.3). The whole server is told.

#### 3.2.3 Ending a war

Peace needs both sides to agree. One side proposes and the other accepts. Until then the war goes on, so a losing side can't just walk off. A peace proposal stays open for 24 hours (section 2.3), and any change in relations cancels it. There's a cooldown between the same two nations so you can't spam war and peace at each other. A war also ends if either nation dissolves.

#### 3.2.4 Alliances

An alliance takes an offer and an acceptance, made by members with the diplomacy permission on each side. It starts immediately.

Allied players can't damage each other at all. This is the only hard block in the game. Allies standing in a region's rings help defend it (section 3.3).

Either side's leadership can press Break alliance at any time. It's instant and the server is told. The two nations go back to neutral, so any kill between them after that is an incident unless they go to war.

#### 3.2.5 Calls to arms and switching sides

A nation at war can call its allies to arms. An ally that accepts is at war with that enemy straight away, with no staff approval and no preparation, because the war already exists and has already been approved. An ally can say no. The alliance stays and there's no automatic penalty. It's a diplomatic choice, and people will remember it.

A nation can switch sides mid-battle by breaking its alliance with one side and accepting a call to arms from the other. That's allowed, on purpose. Betrayal is part of the war. Both steps are announced instantly, so everyone knows who just turned.

Your defence against a surprise attack is diplomacy. A neutral nation with no allies that gets attacked (after preparation) fights alone. A nation with allies can call them in the moment the war request is approved, during preparation, so they're ready when it goes live.

#### 3.2.6 Notifications

Every diplomatic event pops a toast in the top right, in nation colours, and gets logged.

Everyone sees these: war approved or denied, preparation started (with the countdown), war live, peace, alliance formed, alliance broken, call to arms accepted, side switched, nation dissolved, new Leader. A war request is only shown to members of the target nation.

Only the people with the right permissions see these: incidents, charges, compensation payments, trial scheduling and auto-reply actions (section 3.5).

If a lot fire at once they stack and get summarised, so they won't bury your screen.

#### 3.2.7 Where diplomacy lives

Leadership handles all of this in the Cabinet (section 2.2): relations are on the Nations ribbon, offers and proposals come through the Mailbox, and cases are under Justice. Citizens see their own part in the War Office, on the Me and Wanted tiles.

What's there:

| What | What it shows |
|---|---|
| Relations | Every nation's relationship with every other (neutral, allied, preparing, at war), plus pending requests and proposals. |
| Peacetime kills | Your nation's open incidents both ways: who killed whom, the countdown, where it stands (waiting for a charge, waiting for a response, reported to staff), the accused's statement, and the buttons. The victim side gets Demand justice and Forgive. The accused side gets Send to trial, Pay compensation, Kick out, Protect him and Report to staff. |
| Auto-replies | Your nation's automatic policies (3.5.10). |
| Log | The history of diplomatic events. |

Everyone can see relations. Only permission holders can act.

### 3.3 Territory, cores and the ring siege

This is how land changes hands.

#### 3.3.1 Regions

The map is split into regions drawn by staff to follow the actual geography. They aren't chunk squares.

Each region belongs to one nation and has one core: a single indestructible block, a beacon unless said otherwise. One region per nation is its capital. A few borders across water, like the Channel, are linked by staff so the regions on either side count as neighbours.

#### 3.3.2 Front line adjacency

You can only attack a region that borders your own territory. That keeps the war moving along a real front line, and the front updates as regions change hands. Neutral regions don't let you pass through. A neutral region has to be claimed and made yours before you can attack anything beyond it.

#### 3.3.3 The capture rings

Each core sits in the middle of rings that weight your capture power by how close you are:

| Ring | Weight | Reach from the core |
|---|---|---|
| Inner | 1.0 | up to 8 blocks |
| Middle | 0.5 | 8 to 16 blocks |
| Outer | 0.25 | 16 to 24 blocks |
| Beyond | nothing |  |

You only count if you're within 32 blocks above or below the core. The rings are marked in the world so you can see them. Only living players count. Creative and spectator players never do.

#### 3.3.4 The tug of war

While a region is contested, the game adds up the weighted power of the living attackers (nations at war with the owner that hold a bordering region) against the living defenders (the owner plus its allies).

If the two are equal, the capture freezes. Any imbalance pushes the bar towards the stronger side, and the speed climbs sharply with the ratio. Roughly 14 minutes at 1.1 to 1, about a minute at 2 to 1, and about 15 seconds at 4 to 1. It can never move faster than the attackers' total presence allows, so adding a defender can never speed up a capture. If you die, log off or walk out, you stop counting immediately.

#### 3.3.5 Capturing, the capital and neutral land

Win the tug of war and the region flips to the attacker. It can be taken back, so the front keeps moving.

Capitals are fortified. Defenders count for 1.5 times as much there, which makes a capital take roughly twice as long to capture. Capture a nation's capital core and that nation dissolves (1.2.4).

A few edge cases:

- An undefended core still falls, at whatever pace the attackers' ring positions give them.
- If both sides leave, the bar holds for 60 seconds and then drifts back to the owner over about 3 minutes.
- Neutral land (left behind when a nation dissolves) is claimed by standing on it. Allies pool their power. Rival nations that aren't allied block each other, and a rival has to drain the bar to zero before it can start its own claim.

### 3.4 The map

Press J to open the full screen map. (Not M, because Xaero's minimap already uses it.)

It shows the real terrain from above, with each region tinted in its nation's colour. Borders between nations are drawn as strong lines, and borders inside one nation as faint ones. You'll also see region names, gold stars on capitals, neutral land in grey, and live sieges with a contested badge and the capture bar. You can pan, zoom and centre on yourself.

What you see depends on who you are:

- Everyone sees territory, borders, names, capitals, public siege status, and trial markers that have been made public (section 3.5).
- Leadership sees where their own nation's living members are, by region.
- Scouts can find out how many living enemy players are in an enemy region by standing in it. The count stays visible for 30 minutes, to the scout and to his leadership, then expires. There's a cooldown before you can scout it again.

You'll never be sent a position or a count you aren't entitled to, so there's nothing for a cheat client to dig out.

### 3.5 Justice: charges, trials, settlement, outlaws and bounties

Nations deal with crime themselves, in-world, and it always runs the same way. There are two kinds of case:

- **Treason** is killing someone in your own nation (3.1.1). Your own nation charges you.
- **A foreign incident** is killing a member of another nation you're not at war with (3.1.3). The victim's nation charges you, and your nation answers for you.

The screens use plain words: a charge is **Demand justice**, settlement is **Pay compensation**, exile is **Kick out**, refusing is **Protect him**, and standing orders are **Auto-replies**.

#### 3.5.1 Fixed justice rules

These are the same for every nation and nobody can change them.

1. No fines out of nowhere. Nobody can be fined without either a trial or their side choosing to settle. A charge always means "stand trial or settle".
2. Nobody is executed without a trial.
3. Verdicts are final. There are no appeals. If your nation doesn't like a verdict, answer it with diplomacy: war, refusing future handovers, alliances. That's politics, and staff stay out of it.
4. Staff only step in when one of these fixed rules is broken (for example, the accused getting killed during his trial, 3.5.6) or when an incident is reported to staff (3.1.8).
5. The caps on fines and compensation are set by staff and are the same for everyone.

#### 3.5.2 The charge

For a foreign incident, someone in the victim nation with the justice permission presses Demand justice within 24 hours of the kill (1.1.4). If nobody does, the incident closes and counts as forgiven. An auto-reply can charge automatically (3.5.10).

For treason, the kill itself flags the killer, and someone in his own nation with the justice permission has 24 hours to charge him. If nobody does, the nation's auto-reply applies. If it hasn't set one, the case closes, because the nation chose not to act.

A charge names the offence (the kills and who they were) and nothing else. The side doing the charging never names a price.

#### 3.5.3 Settlement (Pay compensation)

Settling means paying a fixed price instead of going to trial. The price is set by staff and depends on the offence, so neither side can talk it up or down. Right now it's $1,000 per kill, doubled if the victim was a seat holder and tripled if it was a Leader.

The accused can pay it from his own wallet, or his nation can pay from the treasury. For a foreign incident the money goes to the victim nation's treasury. For treason it goes to his own nation's treasury.

Each player can be settled for once per event. Your nation can buy you out one time. After that you're a repeat offender and there's no compensation option, only trial, kick out or protect. A rich nation can't keep a paid hitman on the books.

Assassination can't be settled at all. Kill another nation's Leader or a seat holder at peace and the only options are trial, kick out or protect, and the victim nation gets a reason for war straight away (3.2.1). Murdering a leader shouldn't come cheap.

#### 3.5.4 Responding to a charge

For a foreign incident, the accused's nation has 24 hours to respond. Anyone with the justice permission can do it, or the accused can pay for himself (3.1.5). The options:

1. **Send to trial.** The accused goes On Trial (3.5.5) and the charging nation rules on his fate (3.5.6 and 3.5.7).
2. **Pay compensation.** Pay the price (3.5.3) and the case is closed.
3. **Kick out.** The accused is expelled and becomes an outlaw who owes the compensation as debt (3.5.8). The nation is cleared.
4. **Protect him.** The nation stands by him. The victim nation can then request war (3.2.1), which still needs staff approval and goes through preparation as normal.
5. **No response by the deadline** means he's kicked out automatically. It never means war (1.1.5 rule 9).

For treason, you respond yourself, within 24 hours:

1. **Pay compensation.** You accept the fine, which is the treason compensation price, and the case closes.
2. **Stand trial.** Your own nation tries you (3.5.6).
3. **Flee.** You become an outlaw and owe the compensation as debt.
4. **No response** makes you an outlaw.

#### 3.5.5 On Trial status

When your nation sends you to a foreign trial, you temporarily leave your nation and get tagged ON TRIAL, above your head, in the tab list and on the boards. You have no nation permissions and you don't count for your nation in sieges or rosters. Your nation is no longer responsible for you.

If you kill anyone while On Trial, you become an outlaw on the spot for violence in custody. Your old nation isn't charged for it.

If you're killed before the verdict, the case closes, because you're dead. If the killer is from the nation trying you, the trial safety rules in 3.5.6 apply. If the killer is from any other nation, it's an incident against his home nation as usual.

After the verdict:

- fined, pardoned or given a verbal sentence: you go back to your nation automatically
- executed: you're dead
- outlawed, or you didn't show up: you're an outlaw and your old nation is cleared

#### 3.5.6 The trial

A trial is a real event with a time and a place.

1. **Agreeing a time.** The host nation opens the trial. You see it on your Me tile and propose a time, or a range, within the next 24 hours that overlaps the server's opening hours by at least an hour. The host accepts or suggests another time, and once you both agree it's locked in. There are 3 rounds of back and forth at most. If no time is agreed by the deadline because you didn't engage, it counts as a no-show. If it's because the host didn't engage, you walk free, the case is dropped and you go back to your nation.
2. **Venue and who can see it.** The host puts a marker on the map, either where the judge is standing or by clicking a spot. The host chooses who sees it: the whole server, their own nation, or private (judges and the accused only). The accused always sees it.
3. **Running it.** Trials are held over Simple Voice Chat. That's a server rule, and you'll get a warning if you're not connected. A trial lasts an hour at most. The accused has to stay within 100 blocks of the marker. Leave and you get a "Return to your trial" pop-up with 60 seconds to get back. Don't make it and it's a no-show.
4. **Trial safety.** The accused isn't invulnerable. But if he's killed during his trial, the host nation is fined automatically, his home nation is alerted, and staff are told so they can judge whether it was deliberate. If staff rule it was, the fine stands and his nation can request war over it (3.2.1). If they rule it wasn't, the fine is refunded. Staff will try to be at trials when they can.
5. **No-shows.** If the accused doesn't turn up, he becomes an outlaw owing the compensation as debt, and his home nation is cleared. If the accused is there and no judge turns up in time, he walks free and the case is dropped.

#### 3.5.7 Verdicts

Someone with the judge permission delivers the verdict at the trial. The options:

| Verdict | Effect |
|---|---|
| Not guilty, or pardon | No penalty, and the accused goes home. The host also has to wait longer before it can try him again (3.5.11), so frivolous trials cost the accuser. |
| Fine | Any amount up to the cap, paid into the host's treasury. It comes out of the accused's wallet, which can go negative (section 4.3). Anyone with the revert permission (the Leader, unless changed) can reverse a fine. |
| Outlaw | The accused becomes an outlaw (3.5.8). |
| Execution | The accused is killed on the spot at the venue. Perm-death, announced to the server. |
| Verbal sentence | Anything social: labour, service, an apology. The text is recorded but the game doesn't enforce it, and the accused is free to go. |

The verdict is final (3.5.1).

#### 3.5.8 Outlaws

An outlaw has no nation and is marked: a red OUTLAW · WANTED tag over his head and an [OUTLAW] prefix in the tab list. Anyone can kill him with no consequence. He can still do everything else, including hunting bounties. He carries debt from any unpaid compensation or fines.

To come back, an outlaw pays off his debt, and then any nation's leadership can admit him, which clears the mark. The exception is his old nation, which has to wait 72 hours. That wait doubles each time the same player gets kicked out again (1.2.3).

Kills you make as an outlaw follow you home. Every time an outlaw kills a nation's member, it's recorded against him. If a nation later admits him, every one of those kills from the last 7 days becomes an incident against the nation that took him in, and the usual 24 hours to charge starts the moment he's admitted. So no, you can't kick your players out, let them raid as "outlaws" and then take them back clean.

#### 3.5.9 Bounties

A bounty is a cash reward on a wanted target. That's either an outlaw, or a member of a nation you're at live war with. Any player can post one from their wallet, and leadership can post one from the treasury. The money is taken immediately and held until the target dies.

Whoever lands the killing blow collects, and bounties on the same head stack. You can cancel your bounty for a full refund any time before it's claimed. If the target dies to anything other than a player, the posters get their money back. You can't claim a bounty your own nation posted. All bounties are public.

#### 3.5.10 Auto-replies

With 300 players, leaders can't sit in the menus all day. So each nation sets auto-replies once and the game applies them. Anyone with the right permission can override a single case before the auto-reply fires.

| Side | Auto-replies you can set |
|---|---|
| Victim | Demand justice for every peacetime kill. Only demand justice for N or more kills. Never demand justice (forgive everything). |
| Accused (foreign incidents) | Pay compensation from the treasury when it's under $X. Kick out repeat offenders. Always send to trial. Always protect against demands from nation Y. |
| Treason | Charge automatically. What happens if a charged traitor doesn't respond (outlaw). |

Every nation starts with these on: always demand justice for peacetime kills, pay compensation for a first offence, and kick out repeat offenders (section 2.2). Every automatic action still sends the normal toasts and goes in the log. Nothing happens quietly.

#### 3.5.11 Limits

- One active case per player at a time. New offences during a case get added to it.
- The same nation can't put the same player on trial again for 24 to 48 hours. A fresh offence gets around that, and the wait doubles after a not guilty verdict.
- You can't launder money through justice. Compensation and fines only ever move money into a treasury. The only thing in this section that moves treasury money into a wallet is a bounty payout, and members of the nation that posted it can't claim it.
- Kick out and take straight back doesn't work, because of the 72 hour wait (1.2.3).

#### 3.5.12 Where justice lives

As a citizen, you'll find all of this in the War Office (section 2.2). Leadership handles their nation's cases under Justice in the Cabinet.

**The boards** are public and cover every nation. WANTED lists outlaws with their bounty, their debt and what they did. TRIALS lists the accused, the nations involved, the charge, the time, and a "show on map" link if you're allowed to see the marker.

**Your own case** (on Me) shows where you stand and only the actions open to you: pay it myself or leave it to my nation (with a statement), propose or accept a trial time, pay compensation, stand trial or flee (for treason), pay off debt, and ask to be admitted to a nation.

**Bounties** (on Wanted): "Put a cash reward on a wanted player. Whoever kills them collects it. Cancel anytime for a full refund." You post with a plain confirmation, see your active bounties with a Cancel button, and pick targets from a searchable list that tags each one OUTLAW or AT WAR and shows how much is already on their head.

**Your nation's cases** are only visible with the right permissions: treason cases to charge, trials to schedule and judge (venue and visibility), fines to reverse, outlaws to admit, and treasury bounties. Foreign peacetime kills and auto-replies sit with the rest of diplomacy (3.2.7).

A plain member sees the public boards and his own case, and that's it.

## Module 4: Economy and Arms

### 4.1 Money, treasury and tax

#### 4.1.1 Personal money

You have one $ balance. It's whole dollars only, it carries over between sessions, and it isn't tied to your nation or to being alive. The dead keep their money. You start with $100.

Your balance floats above your head in gold, so anyone within 32 blocks can see how rich you are. It's hidden whenever your name is hidden. It's also on your HUD, and it turns red if you go negative.

#### 4.1.2 Nation treasury

Every nation has one shared pot of money. Tax fills it. Automatic costs come out of it, and so do the things leadership is allowed to spend on, like bounties. If the treasury can't cover something, it doesn't happen. Section 4.3 covers what that means.

Leadership can't move treasury money into anyone's personal wallet, their own included. That stops anyone laundering money through bounties (section 3.5).

#### 4.1.3 Tax

Tax is a cut of what you earn, not a charge on what you already have. It's taken the moment money lands, rounded down, and the rest is yours. You'll see a receipt on the action bar, something like "+$1,000 stall sale · 20% tax $200 to Britain · you keep $800".

Whoever holds the tax permission in your nation sets the rate, anywhere from 0 to 50%. It starts at 10%. Staff corrections are never taxed. Nationless players and dead players pay nothing. Being in debt doesn't get you off: income is still taxed.

Section 4.6.8 explains which money is taxed. Short version: money coming in from outside your nation is, pay from your own treasury isn't.

### 4.2 Production and the technology tree

This is a research tree in the style of Rise of Kingdoms. Your nation funds it by donating resources, and leadership picks which way it goes. Completed research opens up better gear tiers, new production and better pay as the event goes on.

#### 4.2.1 The tree

There's one tree and every nation uses the same one, but each nation has its own progress. Every node has a name, an icon, the node or nodes you need first, and a cost in food, iron and gold. In practice that's wheat, iron ingots and gold ingots.

The tree is fixed for the whole event. It won't be changed halfway through, so nobody's progress gets stranded.

#### 4.2.2 Donation and leadership focus

You donate food, iron and gold to an open node, straight out of your inventory. Progress counts for the whole nation. Your personal contribution to each node is recorded, so it can be rewarded later. A node completes once every cost is paid.

When a node's prerequisites are done it becomes available, but it starts locked. Whoever holds the tech permission opens the nodes your nation should research and keeps the rest locked. That's how leadership points everyone's donations down one path. You can only donate to open nodes.

### 4.3 Consequences: upkeep, bankruptcy and penalties

All of this happens automatically. Staff don't step in.

**Territory upkeep.** Every region your nation holds costs money out of the treasury every real hour. The capital costs more. More land, bigger bill. A normal nation earns more than it pays, but a badly run one won't.

**Nation bankruptcy.** A nation that can't pay its upkeep loses regions one at a time until it can. The region furthest from the capital goes first, and if several are equally far, the newest one goes. Lost regions turn neutral. If your nation is down to its capital and still can't pay, it's dissolved, the same way as in section 1.2.5.

**Personal debt.** If your balance drops below $0 you get Slowness, Weakness and faster hunger. They lift as soon as you're back to 0. Zero isn't debt, so a fresh player on $100 is never hit by this. You get into debt through fines (section 3.5) or by spending money you don't have.

### 4.4 Healing and logistics

> The Armory sells medical kits, and the Medic class heals best (section 4.6).

Healing runs on Immersive Healing, not vanilla eating, so field medicine is real logistics. You need medical supplies to heal, and your nation has to produce them (section 4.6.5). A nation that ignores them will win fights and still lose the war to attrition. Medics treat other players far better than anyone else can.

Healing never brings anyone back. Perm-death is final.

### 4.5 Trade

This is lifted from Civilization's deal screen. It has two columns, *Your offer* and *Their offer*.

You can trade treasury money and resources from your nation store (food, iron and gold, collected from donations and the Supply Office). You can't trade regions. Land only changes hands through siege. A trade can be a gift too: just leave one side empty.

Nothing is held back while an offer is waiting. When it's accepted, the server checks both sides can still pay, then does the whole thing at once. If either side can't, it fails cleanly and tells you why.

Any trade over the limit in section 2.1.4 needs the Leader's approval before it can be sent. Every trade appears in both nations' public treasury logs, and the big ones make the newspaper.

### 4.6 Economy, resources and classes

This is the war economy, modelled on Supremacy 1914. Every region produces something, so every region is worth fighting over. The rule behind all of it: you earn money by playing and spend it on things that make playing better. None of this should feel like a job.

#### 4.6.1 The loop

Hold land → land gives mines and farms → you mine and farm, sell to your nation, and earn pay by playing and fighting → your nation turns resources into war gear → you buy gear → you fight and take more land.

#### 4.6.2 Two kinds of material

| Kind | Examples | Rule |
|---|---|---|
| Building materials | stone, cobble, dirt, sand, gravel, wood, glass, clay | Free and unlimited everywhere, same as vanilla. Building is never restricted. |
| War resources | iron, coal, gold, food | Only from your nation's land, and land has limits. |

#### 4.6.3 Regions produce resources

Every region (section 3.3) has a production profile: one or two resources, each with a level. For example *Ruhr: coal* ★★★*, iron* ★ or *Normandy: food* ★★. You can see it on the map and in the region tooltip.

Regions also pay out on their own. Every hour, each region puts money into its owner's treasury and a little of its resources into the nation store (section 4.5). This is where new money comes from.

In mining regions, ore only exists in ore veins placed by the map maker. Ore anywhere else drops nothing. A mined vein grows back after 10 minutes, so a rich vein is ground worth holding, not a pile that runs dry. Only players from the nation holding the region get drops, or anyone at all if the region is neutral. During a war, the enemy can raid it.

Farms have a crop limit. Each region allows a set number of growing crops, and past that, new crops won't grow. Food regions have high limits, and research can raise them.

Wood and building blocks are unlimited (section 4.6.2).

Villager trading, iron from iron golems and piglin bartering are all off, along with any other automatic source of war resources.

#### 4.6.4 The Supply Office and the Armory

Every capital has two counters, a Supply Office and an Armory. Open either one and you get a simple screen like the ones in section 2.2.

At the Supply Office you hand in iron, coal, gold and food. You're paid in $ from the treasury at your nation's buying prices, and the items go into the nation store.

At the Armory you spend $ on war gear: guns, ammo, armour, grenades and medical kits. The money goes into the treasury. The Armory only stocks gear your nation has researched and produced, and it only offers you gear your class can use (section 4.6.6).

Prices are set by whoever holds *Treasury & tax*, inside the limits staff have set for each item. Every price change and every purchase goes in the public treasury log.

You can't craft war gear. The gun mod's crafting is off (gun smith table, ammo and attachment recipes), and so is crafting for the event's armour sets. Vanilla tools still craft as normal.

#### 4.6.5 Production

Nobody stands at a factory by hand. A seat with *Research*, or the Leader, queues production orders like "200 rifle rounds", "20 Lee-Enfields" or "50 medical kits". Each order costs resources from the store, money from the treasury and some real time. When it's done, the goods go into the Armory's stock.

Research (section 4.2) sets what your nation can produce. Lose your coal regions and your factories stall.

#### 4.6.6 Weapon classes

The event uses one gun pack only, Gunpowder Revolution: Great War (WW1). Every gun has a class, a research tier and a price.

You pick one of five classes, and your class controls which guns you can buy and fire.

| Class | Weapons | Role |
|---|---|---|
| Rifleman | bolt-action, lever and single-shot rifles, carbines, bayonets | The backbone |
| Marksman | all Rifleman rifles, plus scopes (Marksman only) and the Sharps | Long range |
| Assault | shotguns, then SMGs late in the war | Trenches and close quarters |
| Machine Gunner | Madsen LMG, then the MG 14/17 | Holds the line |
| Medic | pistols and the full medical kit | Keeps people alive; heals far better |

Pistols and revolvers are open to every class. So are small and big bandages.

Tier 1 weapons are there from day one. Tiers 2 and 3 have to be researched (section 4.2). Each nation's Armory sells its own historical rifle at a discount: the SMLE, Gew 98, Lebel, Mosin and so on.

You can carry another class's gun. You can't fire it.

Class caps are per nation. You can have one Machine Gunner for every 8 living members, and the same for Marksmen. Switching class costs $500 and then you wait 24 h before you can switch again.

You get one free basic kit for your class, once per life. It's marked *issued*, and the Supply Office won't buy it back.

Every other source of weapons is blocked. That includes the TaCZ default pack, Superb Warfare's guns and explosives, the weapons dealer villager and its loot, and anything else that isn't on the event's weapon list.

#### 4.6.7 Specialisations

Your class is how you fight. Your specialisation is how you earn. It's optional and you can only have one.

| Specialisation | Buff |
|---|---|
| Miner | 25% more ore from every ore you mine |
| Farmer | 25% bigger harvests |
| Builder | Builds and breaks blocks faster, and gets 25% more pay on building jobs. The *Fortify a region* job (section 2.5) pays a Builder 25% more per block, out of the job's budget. Fortifications are the Builder's work; there's no Sapper class. |

Buffs raise how much you produce, never what you can sell it for, so you can't pass them on to your mates. Switching specialisation costs $500, with a 24 h wait before you can switch again. You start with none.

#### 4.6.8 Pay

You get paid for playing.

Service pay is a small amount for every minute you're online, alive and actually doing something, up to a daily cap. Stand still and do nothing for five minutes and it stops. It comes out of your nation's treasury. The rate depends on your rank (section 4.6.9), and seat holders and the Leader get a bonus for running the country. Staff set the rates, so leaders can't vote themselves a pay rise.

Combat pay comes from the treasury for kills in a live war, for capturing a region and for defending one.

If the treasury can't cover pay, you don't get paid that time. The treasury never goes negative to pay you. You'll see "Britain couldn't pay you today" and your Leader gets an alert.

Tax (section 4.1) only applies to money coming in from outside your nation: stall sales, bounties and trades. It never touches pay or Supply Office payments, since both already come out of your own treasury.

#### 4.6.9 Rank, medals and your record

You earn XP by fighting (live war kills, captures and defences), by supplying (Supply Office sales, capped per day) and by staying alive.

The ranks are Private → Corporal → Sergeant → Lieutenant → Captain. Each step raises your service pay and gives a small perk, like a discount at the Armory. Your rank shows next to your name.

Medals are for the moments people talk about afterwards: first into a captured region, holding a region while outnumbered, 10 kills in one battle, longest survivor and so on. They show on your profile, and the best ones make the Daily Front.

Your record tracks kills, captures, money earned and days survived. With perm-death, a veteran's record actually means something.

When you die you lose your rank, class and specialisation. You're out of the war.

#### 4.6.10 Player stalls

You can put down a stall, which is a shop chest, on your own nation's land. Sell anything you own from it (food, blocks, gear) for $, to anyone who walks up. Sales are taxed (section 4.6.8). Buying is instant, and it either goes through completely or not at all.

#### 4.6.11 Property protection

| Where | Who can break and place blocks and open containers |
|---|---|
| Your nation's land, at peace | Only your nation, plus staff |
| Enemy land, war live | The enemy too (raids and sieges) |
| An ally's land | Never you. Allies are always protected from each other. |
| Neutral land | Anyone |

You can also lock a personal chest to yourself, so your own countrymen can't help themselves to it.

#### 4.6.12 Compensation scales with wealth

Compensation for a peacetime kill (section 3.5.3) is whichever is higher: the standard price, or 25% of the killer's money. Being rich doesn't make the one kill you can buy cheap.

#### 4.6.14 Armour that actually stops bullets

Vanilla armour barely touches gun damage. A rifle round does about 30 damage against your 20 health, and vanilla armour only takes about 10% off, which would make armour pointless. So the event uses its own bullet protection, based on where the hit lands.

The aim is simple: every rifle kills a uniformed player in exactly 2 body shots. No one-shots, no three-taps. Armour stats and set bonuses from the mods themselves don't count here.

The helmet is the only thing that protects your head. The tunic protects your body and the trousers protect your legs. How much they protect depends on your class, never on what the armour looks like:

| Class | Tunic | Trousers | Speed |
|---|---|---|---|
| Rifleman | 40% | 25% | normal |
| Marksman | 35% | 20% | 5% faster |
| Assault | 45% | 30% | normal |
| Machine Gunner | 50% | 35% | 5% slower |
| Medic | 35% | 25% | 5% faster |

The reinforced tunic (tier 3) gives 55%, slows you a further 5% on top of your class, and lasts twice as long. The steel helmet gives 40%. Caps, hats and boots give nothing.

Two rules always hold:

1. At full health and wearing any tunic, no single body or leg hit from any gun kills you. A shotgun blast counts as one hit.
2. Bolt-action and single-shot rifles, the Sharps included, always kill a uniformed player in exactly 2 body shots.

Headshots kill. The exception is a steel helmet, which saves you once: you're left on 1 to 2 hearts and the helmet is nearly wrecked. The Sentry and Arditi helmets count as steel helmets.

Armour wears out, counted in hits: 30 for a tunic or trousers, 60 for the reinforced tunic, 20 for a helmet. A piece gives full protection right up until it breaks. Then you buy a new one at the Armory.

Armour-piercing ammo (FMJ and slugs) ignores half the protection.

The armour comes from Historical Armors and Fields of 1918. From Fields of 1918 we only use the armour. Everything else in that mod (blocks, weapons, vehicles) is off, apart from sandbags and barbed wire, which you can still place.

### 4.7 Tanks

There are four WW1 tanks, one for each nation that actually fielded one. Russia and Austria-Hungary don't get one.

| Nation | Tank | Health | Speed | Seats | Weapons | Alive at once |
|---|---|---|---|---|---|---|
| British Empire | Mark V | 600 | about 2.5 blocks/s | driver, 2 side gunners, front machine gunner | two 6-pounders (one per side), 1 MG | 2 |
| Germany | A7V | 650 | about 3 blocks/s | commander and driver, main gunner, 2 MG gunners | 57 mm in the nose, 2 MGs | 2 |
| Italy | Fiat 2000 | 650 | about 2.5 blocks/s | driver, turret gunner, 2 MG gunners | 65 mm turret gun, 2 MGs | 2 |
| France | Renault FT | 300 | about 5 blocks/s | driver, turret gunner | 37 mm turret gun | 3 |

#### 4.7.1 Getting one

The Armour research node (after Industrial War, tier 3) lets your nation build its tank. A seat with *War & peace* (the army), or the Leader, orders one from the Motor Pool section of the Cabinet. It costs iron, gold and coal from the nation store, money from the treasury, and then real time: about 6 h for a heavy tank, 3 h for the FT.

The finished tank rolls out next to the Motor Pool block in your capital.

A nation can have two heavy tanks at most, counting the ones still being built (France gets three FTs). The whole server is capped at 12. A destroyed tank is gone for good and has to be built again.

#### 4.7.2 Crew

Only living members of the owning nation can get in, so nobody can steal your tank. Use to get in, Sneak to get out, Left Alt to change seat.

The Motor Pool section lists every tank with its health, where it is and who's aboard. From there you can assign a crew, so only they can get in, or recall a tank, which kicks everyone out.

The driver drives: W and S, with A and D turning on the spot. The driver can't shoot. Each gunner has their own seat, view and gun. The gun follows where you look, within its arc, and fires on Attack. The HUD shows the arc under your crosshair and where the shot will land. The crew are safe inside. Anything aimed at them hits the hull instead.

#### 4.7.3 Moving

Tanks are slow. They climb one block steps, not two. In water they slowly sink, and deep water finishes them. A tank won't drive into land its driver can't build on, which means an ally's land or the land of a nation you aren't at war with. It can always drive out of land it's already in. An empty tank comes to a stop after 30 s.

#### 4.7.4 Fighting

Tank cannons explode with splash damage that hurts both people and tanks. Tank machine guns fire normal bullets and follow the armour rules in section 4.6.14. No tank weapon ever breaks blocks.

Against a tank, rifles do almost nothing. Armour-piercing (FMJ) rounds do a little and machine guns a bit more. Another tank's cannon does full damage. The Bundle Charge (Assault, tier 2, from the Armory) can be thrown or stuck on a tank by hand, and it goes off after 3 s for heavy damage.

You can't damage your own nation's tanks or an ally's. The dead can't damage any tank.

#### 4.7.5 Repair

A crew member with a repair kit (crafted from iron) can slowly fix a tank once it's gone 30 s without being hit. A Builder repairs 50% faster.

#### 4.7.6 Losing one

At zero health a tank blows up. The blast doesn't break blocks, but every crew member takes heavy damage, enough to kill anyone already hurt. Perm-death applies as normal, and the kill goes to whoever destroyed the tank.

When a region is captured, any empty tanks of the losing nation sitting in it are destroyed. When a nation falls, all its tanks go with it.

Every tank built and destroyed, and who destroyed it, goes in the nation's log and the Daily Front.

## Module 5: Screens, Website and Getting Help

### 5.1 Getting help from staff

Staff don't referee ordinary outcomes (1.1.5, rule 3). If you lost a fight fair and square, that's the war. What staff do handle:

- **War declarations.** Every war request goes to staff, who approve it or turn it down with a reason (3.2.2).
- **Disputes.** If your nation disputes a charge, staff read the fight log (every hit, with the time, weapon, damage, positions and who shot first) and uphold the charge, void it or reverse it (3.1.8).
- **Trial breaches.** If an accused player is killed during his trial, the host nation is fined automatically and staff rule on whether it was deliberate. If it was, the fine stands. If not, it's refunded (3.5.6).
- **Genuine bugs.** Staff can fix things a bug broke, including reviving someone who died to one. Dying to your own bad decisions isn't a bug.
- **Moderation.** Staff can read any nation's mail, remove newspaper articles, and mute a nation's mail or press for a while.

Every staff action is logged with the name of whoever took it.

### 5.4 The web companion

> Coming later. Everything in game works without it.

The web companion is a website that mirrors your in-game screens, so you can see what's going on and act on it without being on the server. It's what makes the flat 24 h deadlines fair (1.1.4).

You sign in with an account linked to your Minecraft account, and you see exactly what your in-game screens would show you. Same view, same permissions.

Anything with a deadline can be done from the website:

- charging or forgiving
- responding to a charge: trial, settle, exile, refuse or dispute
- *pay it myself*, and the statement
- proposing and agreeing trial times
- war requests, peace proposals and alliance proposals
- calls to arms and breaking alliances
- ending preparation
- auto-replies and bounties
- seat and succession management

Nothing physical happens on the website. Fighting, sieges, donating items to the research tree and turning up to a trial all stay in game.

Toasts (3.2.6) will reach you off the server too, on the website and possibly as a Discord DM.

If you're dead, you can still log in and look at your record. You just can't do anything.

### 5.5 The intro, title screen and pause screen

The title screen is ours. It has one "Join the war" button and your public event profile: nation, alive or fallen, rank, class, specialisation, medals and record. If the server's offline it shows the last copy it had. It never shows your money or anything private.

The pause screen is plain vanilla, no extra buttons. Our screens open by key: War Office on P, Cabinet on I. Minecraft's Social Interactions has been moved off P so nothing clashes.

Minecraft's own screens are left alone on purpose, so you aren't hunting for things. Options, the death screen, disconnects, loading screens, chat, tooltips and the pause screen all look and work the way you already know. Ours are the intro, the title screen, the failed join screen, and our game screens: War Office, Cabinet, Supply Office and Armory, the map and the research tree. The game window is called The Great War.

#### 5.5.1 The intro and the menu background

The intro plays once each time you start the game. Skip is in the bottom right, or press Space, Enter or Esc. "Watch intro" on the menu plays it again.

The bunker ambience and the intro booms play on the master volume, not the music slider, so turning music off won't silence them. Nothing else plays in the menus.

Behind the menu there's a looping video of a dark bunker. It's built into the pack, so there's nothing extra to install, and it works the same on Windows and macOS.

Under "Join the war" there's a status line that updates every few seconds, like "Online · 3 at war · 42 ms", or "Can't reach the front right now · retrying" if the server's down.

If a join fails before you reach the world, you get one plain sentence and a "Back to the menu" button. Missing or wrong mods are listed by name. If you're not on the whitelist you'll see "This front is closed to you for now." Once you've been in the world, a disconnect shows Minecraft's normal screen.

### 5.6 Worked examples

Some examples of how things play out. Britain and Germany are at peace unless it says otherwise.

#### 5.6.1 Simple case, automated

Bob (Britain) shoots Hans (Germany) first and kills him. An incident opens and Germany's auto-reply demands justice from Bob automatically. Bob gets a toast and clicks *Leave it to my nation*. Britain's auto-reply pays compensation for anything under $2,000, so the $1,000 moves from Britain's treasury to Germany's. Case closed. Apart from Bob, nobody clicked anything.

#### 5.6.2 Repeat offender

Two days later Bob kills another German, and Germany charges him. Compensation isn't on the table this time (one per player per event). Britain's justice minister gets the toast and picks Kick out. Bob is now an outlaw owing $1,000, and Britain is in the clear. Bob pays off his debt a day later and France takes him in. Britain couldn't have taken him back for 72 h.

#### 5.6.3 Self-defence

Hans shoots Bob first and Bob kills Hans. No incident, because Hans started it.

#### 5.6.4 Baiting dispute

A German sprints into a British trench line and gets killed in a messy firefight. The log isn't clear. Germany charges and Britain reports it to staff. Staff read the fight log and void the charge.

#### 5.6.5 Trial abroad

Germany charges Bob and Britain picks Send to trial. Bob goes ON TRIAL and leaves Britain for the time being. He proposes 7 to 9 pm tomorrow. Germany's judge accepts 8 pm and puts a public marker in Berlin. Bob turns up, and the verdict is a $1,500 fine. It's charged to Bob's wallet and he goes back to Britain automatically. Britain hates the verdict. It can't appeal, but it can refuse every German charge from now on.

#### 5.6.6 Execution

Same as 5.6.5, but the verdict is execution. Bob is killed on the spot, and that's perm-death.

#### 5.6.7 Killed at his trial

During Bob's trial a German soldier shoots him. Germany is fined automatically, Britain is alerted and staff get a breach to look at. Staff rule it deliberate, so the fine stands, and Britain requests war over it.

#### 5.6.8 Silence

Germany charges Bob while every British leader is offline. Nobody in Britain responds within 24 h, in game or on the website. Bob is kicked out automatically. No war.

#### 5.6.9 Refusal leads to war

Britain protects Bob. Germany requests war and staff approve it. During the 24 h preparation Germany calls Austria-Hungary to arms and Britain calls France. A German kills a Briton during preparation. That opens an incident, and Britain ends preparation, so the war goes live straight away. When the war goes live, every open incident between Britain and Germany closes.

#### 5.6.10 Switching sides

Mid-war, Italy (allied to Germany) breaks the alliance and accepts France's call to arms. The whole server gets a toast for both. Italy is now at war with Germany, immediately.

#### 5.6.11 Treason

Bob kills a fellow Briton and Britain charges him. Bob chooses to stand trial, and Britain's judge pardons him. If he'd ignored the charge, he'd have become an outlaw.
