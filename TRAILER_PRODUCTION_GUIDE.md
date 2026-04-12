# Trailer Production Guide — Step by Step

Incorporates all feedback from design review + Codex review.

**Two deliverables:**
- 20-second homepage hero (landscape 16:9)
- 15-second vertical clip for Twitter/TikTok (9:16)

---

## STEP 1: Generate Reference Stills (30 min)

Go to https://sora.com (or ChatGPT with image gen).

Generate ONE high-quality still image for each scene. These establish character consistency and style. You'll use these as reference for all video clips.

### Still 1: "The Family" (character reference sheet)
```
Stylized 2D watercolor illustration, frontier art style, visible brushstrokes, warm golden palette. A pioneer family of five standing in front of a covered wagon: father in suspenders and hat, mother in calico dress, teenage son, young daughter (age 7), and a toddler. Two oxen beside the wagon. 1848 clothing. Full body, facing camera, soft warm light. Character reference sheet style.
```
Save this. You'll reference it in every video prompt.

### Still 2: "Golden Departure"
```
Stylized 2D watercolor illustration, frontier art style, visible brushstrokes, warm golden palette. Wide shot of a covered wagon pulled by two oxen rolling down a dirt road away from a small 1840s frontier town at golden hour. Family of five walks alongside. Wildflowers line the road. Warm light, long shadows. Hopeful, beautiful.
```

### Still 3: "River Crossing"
```
Stylized 2D watercolor illustration, frontier art style, visible brushstrokes, cool steel-blue and gray palette. A covered wagon fords a wide river, water up to axles. Woman holds child above waterline. A supply crate floats away downstream. Overcast sky. Desaturated, tense.
```

### Still 4: "The Gravestone"
```
Stylized 2D watercolor illustration, frontier art style, visible brushstrokes, nearly monochrome pale ochre and ash gray. A lone wooden grave marker on empty windswept prairie. Dead grass. Family of four stands behind it in mourning, father holds hat. The daughter is missing from the group. Flat white sky. Melancholy, sparse.
```

### Still 5: "The Blizzard"
```
Stylized 2D watercolor illustration, frontier art style, incomplete brushstrokes, visible white canvas showing through, unfinished edges. Almost entirely gray and white. Three figures and a damaged wagon trudge through a mountain pass blizzard. One ox. Teenage boy walks behind, separated, head down. The painting itself is falling apart. Desolate.
```

### Still 6: "Martha at the Fire"
```
Stylized 2D watercolor illustration, frontier art style, incomplete brushstrokes, nearly monochrome. A lone woman sits at a dying campfire on the empty prairie at night. Two tin plates set out, one seat visibly empty. Wind blows her hair. The firelight barely illuminates. Ash gray and faded amber only. Grief, silence.
```

### Still 7: "The Newspaper"
```
Stylized 2D watercolor illustration of a vintage 1848 newspaper broadsheet on a wooden table. Sepia tones, aged paper, period serif type. Masthead reads "THE INDEPENDENCE GAZETTE". Coffee stains, fold creases. Warm candlelight from left. Nostalgic.
```

---

## STEP 2: Generate Video Clips (1-2 hours)

Go to https://sora.com. Use each still as the **reference image** and add motion.

### Clip 1: Departure (4 seconds)
Upload Still 2 as reference. Prompt:
```
Animate this watercolor scene. The wagon rolls forward slowly, wheels turning. The family walks alongside. The father tips his hat. The daughter waves. Wildflowers sway gently. Slow camera drift forward. 4 seconds. Warm golden light.
```

### Clip 2: River Crossing (4 seconds)
Upload Still 3 as reference. Prompt:
```
Animate this watercolor river crossing. Water ripples around the wagon wheels. The woman lifts the child higher. A wooden crate breaks loose and floats downstream. The man reaches for it and misses. Camera at water level, slight tilt. 4 seconds.
```

### Clip 3: Gravestone (4 seconds)
Upload Still 4 as reference. Prompt:
```
Animate this watercolor prairie scene. Wind blows through dead grass. The family stands motionless behind the grave. Camera slowly pushes in on the grave marker. Minimal movement. 4 seconds. Melancholy, still.
```

### Clip 4: Blizzard (3 seconds)
Upload Still 5 as reference. Prompt:
```
Animate this watercolor blizzard scene. Snow swirls heavily. The figures trudge forward slowly. The wagon lists. The boy trails behind. Camera tracks alongside. The watercolor strokes feel unfinished, dissolving. 3 seconds.
```

### Clip 5: Martha at the Fire (4 seconds)
Upload Still 6 as reference. Prompt:
```
Animate this watercolor campfire scene. The fire flickers weakly. The woman stares at the empty seat. Wind blows embers. Very subtle movement. Camera holds still. 4 seconds. Silent grief.
```

### Clip 6: Newspaper (3 seconds)
Upload Still 7 as reference. Prompt:
```
Animate this watercolor newspaper. Camera slowly zooms in on the headline. Candlelight flickers casting moving shadows on the paper. Aged paper texture. 3 seconds.
```

**If Sora won't animate a reference:** Just use the stills as-is with a slow Ken Burns zoom in your editor. Stills with text overlays work fine for a trailer.

---

## STEP 3: Screen-Record Terminal Shots (15 min)

Open https://oregon-trail.pages.dev in Chrome. Use a screen recorder (OBS, or just Cmd+Shift+5 on Mac).

### Terminal Shot A: "Cholera Diagnosis"
1. Start a game, get to the travel screen
2. Open browser console, type: `document.getElementById('narrative').innerHTML = '<div class="narrative-block"><span style="color:#ffc832">Sarah has contracted cholera.</span></div>'`
3. Record 4 seconds of the terminal with the blinking cursor

### Terminal Shot B: "Thomas's Silence"
Same approach, inject:
```
Thomas has not spoken in four days.
At supper he divided his ration into two portions
and left one on the ground.
```
Record 3 seconds.

### Terminal Shot C: "Agency Steal"
Inject the party roster with Thomas at sanity 12/100, then below:
```
Before you can decide, Thomas acts —
```
Record the text typing out (3 seconds).

### Terminal Shot D: "Martha's Grief"
On a black screen with just the terminal font, type out:
```
Martha has stopped eating.
She sets a place at the fire for Sarah every night.
Sarah has been dead for 11 days.
```
Record 4 seconds. This will be overlaid on the Martha campfire clip (Still 6).

---

## STEP 4: Edit — 20-Second Homepage Version (30 min)

Use CapCut (free), DaVinci Resolve (free), or even Canva Video.

### Timeline:

| Time | Clip | Text Overlay | Notes |
|------|------|-------------|-------|
| 0:00-0:04 | Clip 1 (Departure) | "Every journey begins with hope." at 0:02 | Warm, golden |
| 0:04-0:07 | Clip 2 (River) | "Grounded in real 1848 history." | Desaturate 30% |
| 0:07-0:10 | Terminal Shot A (Cholera) | "No two playthroughs are the same." above terminal | |
| 0:10-0:13 | Clip 3 (Gravestone) | "Every death is permanent." | Desaturate 60% |
| 0:13-0:16 | Clip 5 (Martha) + Terminal Shot D overlaid at 50% opacity | Single card: "Every run ends in a newspaper. Most of them are obituaries." | Nearly monochrome |
| 0:16-0:18 | Clip 6 (Newspaper) | (newspaper is the visual) | Sepia warmth |
| 0:18-0:20 | Black screen | "oregon-trail.pages.dev" + "Play free. No login." | Amber on black, hold 2s |

### Text overlay settings:
- Font: IBM Plex Mono (or Courier New as fallback)
- Size: 36px equivalent
- Color: #F5F0E8 (warm white)
- Shadow: 2px 2px 8px rgba(0,0,0,0.8)
- Position: bottom-center, 15% from bottom edge
- Animation: fade in 0.4s, hold, fade out 0.3s

### Color grading (apply in order):
- Clips 1: leave warm
- Clip 2: reduce saturation 30%, shift blue
- Terminal shots: no grading needed
- Clip 3: reduce saturation 60%
- Clip 5 (Martha): nearly monochrome, keep only faint amber from fire
- Clip 6: sepia tint
- Final card: pure black

---

## STEP 5: Edit — 15-Second Vertical Version (15 min)

Crop/reframe for 9:16 (1080x1920). This is the Twitter/TikTok viral clip.

| Time | Clip | Text |
|------|------|------|
| 0:00-0:03 | Clip 3 (Gravestone), cropped vertical | "Every death is permanent." |
| 0:03-0:06 | Clip 4 (Blizzard), cropped vertical | "Classroom-safe." (ironic) |
| 0:06-0:10 | Clip 5 (Martha) + Terminal Shot D | "To psychological horror." |
| 0:10-0:13 | Clip 6 (Newspaper) | "Every run ends in a newspaper. Most of them are obituaries." |
| 0:13-0:15 | Black | "oregon-trail.pages.dev" |

This is the clip people share with "what the fuck" captions. The Martha frame with the empty plate is the screenshot moment.

---

## STEP 6: Export (5 min)

### Homepage version (20s):
```bash
ffmpeg -i trailer_20s_raw.mp4 -c:v libx264 -crf 26 -preset slow -vf scale=1280:720 -c:a none -movflags +faststart trailer.mp4
```
Target: under 3MB at 720p. The `-crf 26` + 720p keeps it small. Watercolor compresses beautifully.

### Vertical version (15s):
```bash
ffmpeg -i trailer_vertical_raw.mp4 -c:v libx264 -crf 24 -preset slow -vf scale=1080:1920 -c:a none -movflags +faststart trailer-vertical.mp4
```

### Poster frame (for before video loads):
```bash
ffmpeg -i trailer.mp4 -ss 00:00:01 -frames:v 1 trailer-poster.jpg
```

---

## STEP 7: Deploy to Landing Page (5 min)

Once you have `trailer.mp4` and `trailer-poster.jpg`:

1. Put both files in `public/`
2. Tell me and I'll wire up the landing page integration (fullscreen takeover that contracts into the terminal)
3. Redeploy to CF Pages

---

## Checklist

- [ ] Generate 7 reference stills in Sora
- [ ] Generate 6 video clips (or use stills with Ken Burns)
- [ ] Screen-record 4 terminal shots from the live game
- [ ] Edit 20-second homepage version
- [ ] Edit 15-second vertical version
- [ ] Export with ffmpeg
- [ ] Drop trailer.mp4 + trailer-poster.jpg in public/
- [ ] Tell Claude to wire up landing page
- [ ] Redeploy

**Total time estimate: 2-3 hours** (mostly waiting for Sora generations)
