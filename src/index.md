---
title: "NBA 2003–04 Shot Chart Explorer"
---

# NBA 2003–04 Shot Chart Explorer

```js
import InteractiveViz from "./components/InteractiveViz.js";

// Load the CSV data using FileAttachment (available in .md files)
const rawData = await FileAttachment("data/NBA_2004_Shots.csv").csv();

// Column mapping configuration
const columns = {
  x: "LOC_X",
  y: "LOC_Y",
  made: "SHOT_MADE",
  player: "PLAYER_NAME",
  team: "TEAM_NAME",
  distance: "SHOT_DISTANCE",
  date: "GAME_DATE",
  quarter: "QUARTER",
  minsLeft: "MINS_LEFT",
  secsLeft: "SECS_LEFT"
};

// Pass the loaded data and config to the component
display(InteractiveViz({
  data: rawData,
  columns: columns,
  title: "NBA 2003–04 Shot Chart Explorer"
}));