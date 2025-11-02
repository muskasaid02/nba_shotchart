---
title: "NBA 2003–04 Shot Chart Explorer"
---

# NBA 2003–04 Shot Chart Explorer

```js
import InteractiveViz from "./components/InteractiveViz.js";

// Map your CSV columns here:
const CONFIG = {
  dataUrl: "/static/NBA_2004_Shots.csv",
  columns: {
    // Core fields (make sure these names match your CSV headers)
    x: "LOC_X",                 // horizontal court coordinate
    y: "LOC_Y",                 // vertical court coordinate
    made: "SHOT_MADE",          // 1 made, 0 missed
    player: "PLAYER_NAME",
    team: "TEAM_NAME",
    distance: "SHOT_DISTANCE",  // numeric
    date: "GAME_DATE",          // format like MM-DD-YYYY (we'll parse)
    quarter: "QUARTER",
    minsLeft: "MINS_LEFT",
    secsLeft: "SECS_LEFT"
  },
  title: "NBA 2003–04 Shot Chart Explorer"
};

display(InteractiveViz(CONFIG))

