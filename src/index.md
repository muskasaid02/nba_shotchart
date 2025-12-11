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
display(
  InteractiveViz({
    data: rawData,
    columns: columns,
    title: "NBA 2003–04 Shot Chart Explorer"
  })
);

```

    Design Analysis

      For this assignment, I wanted to make an interactive graphic 
      that actually feels useful and fun to explore instead of just 
      a static shot chart. NBA shot data works well because it is 
      naturally spatial, so mapping the shot coordinates onto a half 
      court makes the visual easy to understand. I used simple colored 
      dots to show makes (green) and misses (red) so the chart stays 
      readable even when there are a lot of points.

      I added a separate distance histogram instead of trying to encode
      distance directly on the court, because that made things too cluttered. 
      The histogram also let me add brushing, which was one of the 
      most helpful interactions. Dragging across the distance range instantly 
      filters the court and updates the summary stats, which makes it 
      really easy to compare how players shoot from different spots.

      The sidebar filters let you look at different players, teams, 
      shot results, and distance categories. Everything updates instantly, 
      and the tooltips give extra info when you hover without overwhelming 
      the chart.

    Development Process
      I started by exploring the dataset and fixing the shot-make field so 
      both makes and misses would display correctly. Then I built the 
      court, plotted the shots, added the histogram, brushing, and summary cards. 
      Most of the debugging time went into getting the court aligned correctly and making 
      sure all the filters updated the whole view consistently. Overall I probably spent 
      around 8–10 hours building, testing, and refining everything.

    References
      NBA 2003–04 shot dataset (course CSV)
      D3.js documentation (scales, brushes, selections)
      Observable Framework docs


