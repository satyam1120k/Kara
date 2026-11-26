# KĀRA: Towers of Dawn & Eclipse

**Official Rulebook & Reference Manual (v1.0)**

| Attribute              | Details                                                                          |
| :--------------------- | :------------------------------------------------------------------------------- |
| **Players**            | 2 _(Dawn vs. Dusk)_                                                              |
| **Board**              | 9×9 Grid (`a1–i9`)                                                               |
| **Components**         | 32 Double-Sided Pieces _(16 per player)_                                         |
| **Estimated Playtime** | 25–45 minutes                                                                    |
| **Core Influences**    | Chess _(geometry)_, Shogi _(rebirth & promotion)_, Gungi _(3D stacking & draft)_ |

---

## Table of Contents

1. [Overview](#1-overview)
2. [The Board & Zones](#2-the-board--zones)
3. [Army Roster](#3-army-roster)
4. [Setup: The Alternating Draft](#4-setup-the-alternating-draft)
5. [Turn Structure](#5-turn-structure)
6. [Core Mechanics](#6-core-mechanics)
7. [Victory & End-Game Conditions](#7-victory--end-game-conditions)
8. [Piece Compendium](#8-piece-compendium)
9. [Edge Cases & Official Rulings](#9-edge-cases--official-rulings)
10. [DIY / Print-and-Play Guide](#10-diy--print-and-play-guide)

---

## 1. Overview

**Kara** is an abstract strategy game fought across shifting vertical towers. Every piece has two faces (**Dawn** and **Eclipse**) and two roles: when standing on top, it dictates **how a tower moves**; when buried beneath an ally, it grants a passive **Echo** blessing. Captured enemies are reborn in your Reserve, forcing a constant choice between expanding across the board, building towering fortresses, or sacrificing reserves to awaken your army.

### Game Types

When you start a game you choose one of three types. Each adds a layer of rules to the one before:

| Type | Promotion (Eclipse) | Stacking | Notes |
| :--- | :---: | :---: | :--- |
| **♟ Simple** | No | No | Move and capture only. Check, checkmate and Ascension apply. Best for learning. |
| **🌘 Eclipse** | Yes | No | Pieces entering, moving within or leaving the opponent's Citadel may awaken to their Eclipse face. |
| **🏯 Towers** | Yes | Yes | The full rules in this book: towers, Echoes, Peeling Strikes and Aegis. |

Games recorded before the three types existed as "Classic" count as **Eclipse**, because they used the same rules.

### Playing Online

Live at **https://kara.kara-game.workers.dev**. Players sign up with a username and password, then play rated games against random opponents or friends (invite link). Everyone starts at **1200 Elo**. Winning against a stronger player earns more points. New players' ratings move faster for their first 30 games.

| Title | Rating |
| :--- | :--- |
| Newbie | below 1200 |
| Pupil | 1200+ |
| Specialist | 1400+ |
| Expert | 1600+ |
| Candidate Master | 1900+ |
| Master | 2100+ |
| International Master | 2300+ |
| Grandmaster | 2400+ |
| International Grandmaster | 2600+ |
| Legendary Grandmaster | 3000+ |

You can still play the computer or a friend on one device, including offline.

### Project Layout (for developers)

| Path | What it is |
| :--- | :--- |
| `public/` | The game the browser loads (HTML, CSS, JS, fonts, icons). |
| `public/js/engine.js`, `rules.js` | The rules engine. It's shared by the browser **and** the server, so the server checks every online move. |
| `public/js/ratings.js` | Elo calculation and titles (shared). |
| `worker/` | Cloudflare Worker: API, login, matchmaking (`lobby.js`), live games (`game-room.js`). |
| `migrations/` | Database tables (Cloudflare D1). |
| `mobile/` | Android app (Capacitor). It opens the live site full-screen. |

### Commands

- **Run everything locally** (online play included): `npm run dev`, then open `http://localhost:8787`.
- **Tests:** `npm test`
- **Release a change to the game** (rules, screens, fixes): `npm run deploy`.
  - Browsers and the Android app pick it up automatically. Anyone with the game already open sees *"A new version of KĀRA is ready → Update now"*.
  - No new APK is needed, because the app loads the live site.
  - Optional: write one line in `RELEASE_NOTES.txt` and it's shown in the update banner.
  - If you added a file in `migrations/`, run `npm run db:migrate` first.
- **Release a new Android app** (only needed for app-level changes such as the icon, name, web address or Android plugins): `npm run release:app`. This:
  1. bumps the version (`1.1 → 1.2`, or choose one: `npm run release:app -- 2.0`)
  2. builds and signs the APK (finds JDK 21 and a compatible Gradle on its own)
  3. puts it at `/downloads/kara.apk` and deploys
  
  Installed apps then show *"App update available → Download"*.
- **App signing key:** `mobile/keystore/` holds the key that signs the APK. **Back it up.** If you lose it, existing installs can't be updated.

---

## 2. The Board & Zones

The game is played on a **9×9 grid** with files labeled `a–i` (left to right from Dawn's perspective) and ranks labeled `1–9` (bottom to top from Dawn's perspective).

- **Dawn Citadel (Ranks `1–3`):** Dawn's starting zone and Dusk's promotion zone.
- **Dusk Citadel (Ranks `7–9`):** Dusk's starting zone and Dawn's promotion zone.
- **The Frontier (Ranks `4–6`):** Contested neutral territory.
- **The Sanctum (`d4–f6`):** The central 3×3 region.
- **The Zenith (`e5`):** The exact center square of the board, used for the Ascension victory condition.

```text
  a b c d e f g h i
9 . . . . S . . . .  ┐
8 . . . . . . . . .  ├ Dusk Citadel (Dawn's Promotion Zone)
7 . . . . . . . . .  ┘
6 . . . + + + . . .  ┐
5 . . . + ◈ + . . .  ├ Frontier  (+ = Sanctum | ◈ = The Zenith, e5)
4 . . . + + + . . .  ┘
3 . . . . . . . . .  ┐
2 . . . . . . . . .  ├ Dawn Citadel (Dusk's Promotion Zone)
1 . . . . S . . . .  ┘
```

---

## 3. Army Roster

Each player begins the draft with **16 double-sided pieces**, all starting on their **Dawn** face:

| Piece         | Qty | Role                        | Echo Trait _(when buried)_         |
| :------------ | :-: | :-------------------------- | :--------------------------------- |
| **Sovereign** |  1  | Royal piece _(unstackable)_ | _None_                             |
| **Spear**     |  5  | Forward infantry            | **Thrust:** +1 forward step        |
| **Bastion**   |  2  | Defensive anchor            | **Aegis:** Bodyguard absorption    |
| **Scout**     |  2  | Diagonal skirmisher         | **Vault:** Leap over 1 piece       |
| **Rider**     |  2  | Jumping cavalry             | **Gallop:** Grants L-shape leap    |
| **Chariot**   |  2  | Heavy orthogonal slider     | **Horizon:** +2 movement range     |
| **Mystic**    |  2  | Diagonal mystic             | **Phase:** Grants 1-step diagonals |

---

## 4. Setup: The Alternating Draft

Rather than a fixed opening, players build their starting formation through a tactical draft:

1. **Place Sovereigns:** Dawn places their **Sovereign** on `e1`; Dusk places their **Sovereign** on `e9`.
2. **Draft Turns:** Starting with Dawn, players alternate placing **2 pieces at a time** from their pool onto squares inside their own 3-rank **Citadel** (`1–3` for Dawn, `7–9` for Dusk).
3. **Draft Rules:**
   - All pieces must be placed on their **Dawn** side.
   - Players may stack pieces up to **2 tiers high** during the draft _(Tier 3 towers may only be formed once gameplay begins)_.
   - Sovereigns cannot stack onto or be stacked under any piece.
4. **First Turn:** Once all 30 drafted pieces are placed, **Dawn** takes the first turn of the game.

---

## 5. Turn Structure

Players alternate turns. On your turn, you must perform **exactly one** of the following three actions:

1. **Move:** Move one of your standalone pieces or the **top piece** of one of your towers according to its movement rules (landing on an empty square, capturing an enemy, or stacking onto a friendly piece/tower).
2. **Deploy:** Place 1 piece from your **Reserve** onto any empty square _(except `e5`)_ or directly onto a friendly piece/tower of height 1 or 2.
3. **Sacrifice to Awaken:** Permanently discard 1 piece from your **Reserve** out of the game to flip any **1** of your exposed (standalone or top-of-tower) **Dawn** pieces on the board to its **Eclipse** side.

---

## 6. Core Mechanics

### 6.1 Towers & Stacking

- **Friendly Stacks Only:** Only pieces belonging to the same player may occupy the same square.
- **Maximum Height:** A tower may contain at most **3 pieces** (Tier 1 = base, Tier 2 = middle, Tier 3 = top).
- **Sovereign Exception:** The Sovereign stands alone; it can never move onto a friendly piece, and no piece may be moved or dropped onto a Sovereign.
- **Moving Off a Tower:** Moving a tower moves **only the top piece**. The piece(s) beneath it remain on the origin square, and the newly exposed piece becomes active.
- **Capturing a Tower:** Because towers are friendly-only, an attacking piece can never land on top of remaining enemy pieces. Therefore:
  - **When capturing a standalone enemy piece (Height 1):** The attacker moves onto that square, and the captured piece goes to the attacker's Reserve.
  - **When attacking an enemy tower (Height 2 or 3):** The attacker captures **only the top piece** into their Reserve _(unless Aegis triggers—see Section 6.2)_ and **remains on its origin square** (a "peeling strike"), exposing the piece beneath!

> _Design Note: This keeps towers strictly single-color at all times and makes multi-tier towers resilient bastions that must be peeled layer by layer._

### 6.2 Echoes (Buried Passives)

- Only **buried** pieces grant their **Echo** trait. A standalone piece or the piece on top of a tower does not grant its Echo to itself.
- All buried pieces in a tower (both Tier 1 and Tier 2 in a 3-tier tower) grant their Echoes simultaneously to the **top piece** when it moves or is attacked.
- **Echo Interaction Summary:**
  - **Thrust (Spear):** Top piece may move **+1 extra square** when moving straight forward.
  - **Aegis (Bastion):** If this tower is attacked, the attacker captures the **lowest buried Bastion** instead of the top piece. The attacker stays on its origin square, the top piece remains in place, and any pieces above the removed Bastion drop down 1 tier.
  - **Vault (Scout):** Top piece may **leap over up to 1 intervening piece** (friendly or enemy) along a straight or diagonal path. It cannot leap over 2 or more pieces.
  - **Gallop (Rider):** Top piece **also gains the Rider's L-shape leap** (2×1 in all 8 directions).
  - **Horizon (Chariot):** Top piece gains **+2 range** to any directional step or slide it can already perform _(does not extend fixed leaps like Gallop or Mystic's 2-square leap)_.
  - **Phase (Mystic):** Top piece **also gains 1-square diagonal movement** in all 4 diagonal directions.

### 6.3 The Cycle of Rebirth (Captures & Reserves)

- Whenever you capture an enemy piece, flip it to your color and reset it to its **Dawn** side. Place it visibly in your **Reserve**.
- **Deployment Restrictions:**
  - Deployed pieces always enter the board on their **Dawn** side.
  - You may **not** deploy a piece directly onto **The Zenith (`e5`)**.
  - You may **not** deploy a Dawn **Spear** onto an empty square on the opponent's farthest rank (Rank `9` for Dawn, Rank `1` for Dusk), though you may stack it onto a friendly piece there if one exists.
  - You may deploy a piece to give check or deliver checkmate.

### 6.4 Eclipse (Promotion)

A piece flips from **Dawn** to **Eclipse** in one of two ways:

1. **The Horizon Rule (Free):** At the end of any board move in which a **Dawn** piece _enters, moves within, or exits_ the opponent's 3-rank **Citadel**, the moving player **may** flip it to its **Eclipse** side. _(Optional: you may choose to keep it on Dawn if desired; once flipped to Eclipse, it remains Eclipse until captured.)_
2. **Sacrifice to Awaken:** Spend your turn to permanently remove 1 Reserve piece from the game and flip any 1 exposed Dawn piece on the board to Eclipse.

---

## 7. Victory & End-Game Conditions

### 7.1 Check & Checkmate

- A **Sovereign** is in **Check** if it is threatened by an enemy piece on the next turn. You may never make a move or deployment that leaves your own Sovereign in Check.
- If your Sovereign is in Check and you have no legal Move, Deploy, or Sacrifice to escape it, it is **Checkmate** and you lose immediately.

### 7.2 Ascension (The Zenith Victory)

You win immediately by **Ascension** if:

1. Your Sovereign moves onto **The Zenith (`e5`)**, AND
2. Your Sovereign remains on `e5` through one full opponent turn **without being placed in Check** during that turn.

_If the opponent puts your Sovereign in Check while it stands on `e5`, you must resolve the Check. Even if you block the Check and remain on `e5`, you do **not** win on the following turn; the opponent must fail to check you on a subsequent turn while you occupy `e5` for Ascension to trigger._

### 7.3 Stalemate & Repetition

- **No Legal Moves:** If a player has no legal action on their turn (even if not in Check), that player **loses**.
- **Threefold Repetition:** If the exact same board state, Reserve contents, and player-to-move occur 3 times, the game is a **Draw**—unless one player is causing the repetition via **Perpetual Check**, in which case the checking player must make a different move.

---

## 8. Piece Compendium

**Diagram Key:**

- `●` = Piece position
- `×` = 1-step move (cannot pass through pieces)
- `▲ ▼ ◀ ▶ ↖ ↗ ↙ ↘` = Sliding ray (stops before friendly pieces, or stacks on them if height < 3; stops on enemy pieces to capture)
- `★` = Leap target (ignores intervening pieces)

---

### 1. Sovereign _(1 per player)_

- **Rules:** Unstackable. Does not promote.
- **Movement:** 1 square in any of the 8 directions.

```text
. . . . .
. × × × .
. × ● × .
. × × × .
. . . . .
```

---

### 2. Spear _(5 per player)_

- **Dawn:** 1 square straight forward.
- **Eclipse:** 1 square orthogonally (4 directions) or forward-diagonally (2 directions).
- **Echo — _Thrust_:** Top piece gains **+1 square** of range when moving straight forward.

```text
  DAWN         ECLIPSE
. . . . .     . . . . .
. . × . .     . × × × .
. . ● . .     . × ● × .
. . . . .     . . × . .
. . . . .     . . . . .
```

---

### 3. Bastion _(2 per player)_

- **Dawn:** 1 square orthogonally (4 directions).
- **Eclipse:** 1 square in all 8 directions.
- **Echo — _Aegis_:** When this tower is attacked, the attacker captures the lowest buried Bastion instead of the top piece.

```text
  DAWN         ECLIPSE
. . . . .     . . . . .
. . × . .     . × × × .
. × ● × .     . × ● × .
. . × . .     . × × × .
. . . . .     . . . . .
```

---

### 4. Scout _(2 per player)_

- **Dawn:** Slides diagonally up to **3 squares**.
- **Eclipse:** Slides diagonally **unlimited** squares, OR steps 1 square orthogonally.
- **Echo — _Vault_:** Top piece may leap over **1 intervening piece** along a directional line.

```text
  DAWN (up to 3)    ECLIPSE (unlimited)
↖ . . . ↗           ↖ . . . ↗
. ↖ . ↗ .           . ↖ × ↗ .
. . ● . .           . × ● × .
. ↙ . ↘ .           . ↙ × ↘ .
↙ . . . ↘           ↙ . . . ↘
```

---

### 5. Rider _(2 per player)_

- **Dawn:** Leaps in an **L-shape** (2 squares orthogonally + 1 square perpendicular, all 8 targets).
- **Eclipse:** Leaps in an **L-shape**, OR steps 1 square orthogonally.
- **Echo — _Gallop_:** Top piece **also gains the L-shape leap**.

```text
  DAWN         ECLIPSE
. ★ . ★ .     . ★ . ★ .
★ . . . ★     ★ . × . ★
. . ● . .     . × ● × .
★ . . . ★     ★ . × . ★
. ★ . ★ .     . ★ . ★ .
```

---

### 6. Chariot _(2 per player)_

- **Dawn:** Slides orthogonally **unlimited** squares.
- **Eclipse:** Slides orthogonally **unlimited** squares, OR steps 1 square diagonally.
- **Echo — _Horizon_:** Top piece gains **+2 range** to any straight or diagonal directional move.

```text
  DAWN         ECLIPSE
. . ▲ . .     . . ▲ . .
. . ┃ . .     . × ┃ × .
◀ ━ ● ━ ▶     ◀ ━ ● ━ ▶
. . ┃ . .     . × ┃ × .
. . ▼ . .     . . ▼ . .
```

---

### 7. Mystic _(2 per player)_

- **Dawn:** Steps 1 square diagonally (4 directions).
- **Eclipse:** Leaps **exactly 2 squares** orthogonally or diagonally (8 targets), OR steps 1 square diagonally.
- **Echo — _Phase_:** Top piece **also gains 1-step diagonal movement** (all 4 diagonals).

```text
  DAWN         ECLIPSE
. . . . .     ★ . ★ . ★
. × . × .     . × . × .
. . ● . .     ★ . ● . ★
. × . × .     . × . × .
. . . . .     ★ . ★ . ★
```

---

## 9. Edge Cases & Official Rulings

- **Q: Can an attacking piece "peel" a tower from afar, or does it have to reach the tower's square normally?**
  - **A:** The attacker must have a legal capture path onto the tower's square. If the enemy tower is Height 2 or 3 (or has Aegis), the capture removes the target piece into the attacker's Reserve, but the attacking piece **stays on its origin square** instead of advancing.
- **Q: Can a tower's own top piece move onto an adjacent square and still keep its Echo buffs for the _next_ turn?**
  - **A:** No. Echoes only apply to the piece currently sitting on top of the tower. Once that piece leaves the tower, it loses those Echoes—and the newly exposed piece below becomes active.
- **Q: How do _Horizon_ (+2 range) and _Thrust_ (+1 forward) interact on a Spear?**
  - **A:** If a Dawn Spear sits atop both a Chariot and another Spear (Chariot Tier 1 + Spear Tier 2 + Spear Tier 3), the top Spear can move up to **4 squares** straight forward (`1 base + 2 Horizon + 1 Thrust`). Without _Vault_ (Scout), it still stops if blocked by another piece.
- **Q: How does _Horizon_ (+2 range) interact with a Rider's L-jump or Mystic's Eclipse 2-square jump?**
  - **A:** It does not modify jumps. _Horizon_ only extends directional steps and slides.
- **Q: Can _Vault_ (Scout Echo) let a piece leap over a friendly piece and land on an enemy tower directly behind it to capture?**
  - **A:** Yes, as long as there is only **1** piece in between and the target square is within the top piece's movement range.
- **Q: Can I Sacrifice to Awaken a piece that is buried inside a tower?**
  - **A:** No. You may only Awaken an **exposed** Dawn piece (either standalone or on the top tier of a tower).

---

## 10. DIY / Print-and-Play Guide

You can assemble a playable set in 10 minutes:

1. **Board:** Draw a **9×9 grid** on posterboard or paper. Shade ranks `1–3` and `7–9` lightly, outline `d4–f6`, and draw a crown or star in `e5`.
2. **Pieces:** Cut **32 heavy cardboard squares or wooden discs** (roughly 2.5 cm / 1 inch wide so they stack cleanly).
   - Give **16 pieces** a white/light rim (Dawn) and **16 pieces** a black/dark rim (Dusk).
   - On the **Dawn** face, write the piece's initial (`S`, `Sp`, `B`, `Sc`, `R`, `C`, `M`) in plain ink.
   - On the **Eclipse** face, write the initial inside a gold/red star or circle (`★`).
   - _Tip:_ Keep this compendium open beside the board for your first two games—by game three, all seven silhouettes and Echoes will be second nature.
