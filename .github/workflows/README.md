# Bhumika Smart Class — Android app

Android app for **bhumika.group** with a built-in **Smart Class** for interactive touch panels
and a **multilingual AI Teacher** that explains aloud and writes on the board.

## What's inside

**Website (Home tab)**
- bhumika.group in a fast in-app browser with bottom navigation: Home · Library · Smart Class · Catalogue · Downloads
- PDF/book downloads go to `Downloads/Bhumika` · YouTube, Facebook, phone and email links open in their own apps
- Learning videos play full-screen · pull-to-refresh · offline screen (Smart Class still works offline)

**Smart Class (touch-panel teaching tools)**
- Pen, highlighter, eraser, shapes (line, arrow, rectangle, circle, triangle), text, insert picture
- Multi-touch: several students can write at once · palm/fist erase on large contacts
- 12 colours, 4 thicknesses, undo/redo, two-tap clear, unlimited pages
- Page styles: white, paper, grid, graph, ruled, English 4-line, dots, chalkboard, black
- Tools: countdown timer & stopwatch, random student picker, spotlight, screen curtain,
  ruler, protractor, calculator, quiz cards, save page to gallery
- **Library → “Write on this page”**: open any Bhumika e-book page and annotate it on the board
- Toolbar can be flipped left/right for tall panels

**AI Teacher (voice + text, 21 languages)**
- English, Hindi, Urdu, Bengali, Punjabi, Marathi, Gujarati, Tamil, Telugu, Kannada, Malayalam,
  Odia, Assamese, Nepali, Sanskrit, Arabic, French, Spanish, German, Chinese, Japanese
- **Teach a Lesson**: type a topic, pick class & subject — the AI teaches step by step,
  speaking each step while it writes headings, bullets, formulas, tables and labelled diagrams
  on the board, then runs a quiz. Pause / next / previous / ask-a-question controls with captions.
- **Ask & Talk**: ask by voice (mic) or typing; answers are spoken and written on the board
- Looks at the board: “Explain the board” and “Check the answer on the board” (sends a picture of the page)
- Voice commands in any language, e.g. “clear the board”, “नया पेज”, “start a 5 minute timer”,
  “open the protractor”, “use chalkboard background”

Speech uses the panel's Android text-to-speech and speech recognition (Google Speech Services).
If a language voice is missing, the app offers a button to install it.

## AI setup
Open Smart Class → AI Teacher → ⚙ Settings and enter a Claude API key (console.anthropic.com).
Default model: `claude-sonnet-5-5` (changeable).  
For a whole school, set **Server endpoint** to your own proxy that adds the key server-side,
so no key is stored on individual panels.

## Build the APK

**Option A — GitHub (no software needed):** push this folder to a GitHub repository.
The included workflow (`.github/workflows/build-apk.yml`) builds automatically; download
`Bhumika-Smart-Class-APK` from the run's *Artifacts* and install it on the panel/tablet.

**Option B — Android Studio:** File → Open → this folder → wait for Gradle sync →
Build → Build APK(s). (Android Studio fetches Gradle 8.9 automatically.)

For Play Store release, create a signing key (Build → Generate Signed Bundle/APK).

## Project layout
```
app/src/main/java/group/bhumika/app/
  MainActivity.kt        website shell
  ClassroomActivity.kt   full-screen Smart Class + library capture
  ClassroomBridge.kt     TTS, speech recognition, AI calls, saving (window.Android)
app/src/main/assets/classroom/
  index.html, style.css  board UI
  board.js               whiteboard engine + AI board writer
  widgets.js             timer, picker, spotlight, curtain, ruler, protractor, calculator, quiz
  teacher.js             AI teacher, lesson player, voice commands
  native.js              bridge adapter (falls back to browser speech APIs)
```
The `classroom` folder also runs in a normal browser (Chrome) for testing, or could be hosted
on bhumika.group as a web version.
