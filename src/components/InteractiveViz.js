// src/components/InteractiveViz.js
import * as d3 from "d3";

// Small helper to inject styles once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
  .shot-explorer {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 1100px;
    margin: 0 auto 3rem;
  }
  .shot-explorer h2 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
  }
  .shot-explorer .lede {
    margin: 0 0 1rem;
    color: #4b5563;
    line-height: 1.4;
  }
  .shot-explorer-layout {
    display: grid;
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    gap: 1.75rem;
    align-items: flex-start;
  }
  .shot-explorer-controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-size: 0.9rem;
  }
  .shot-explorer-controls label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .shot-explorer-controls span.control-label {
    font-weight: 600;
    color: #111827;
  }
  .shot-explorer-controls select,
  .shot-explorer-controls button {
    font: inherit;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid #d1d5db;
    background: #f9fafb;   /* light grey box on dark UI */
    color: #111827;        /* dark text so it pops */
  }
  
  .shot-explorer-controls select:focus,
  .shot-explorer-controls button:focus {
    outline: 2px solid #2563eb;
    outline-offset: 1px;
  }
  .shot-explorer-controls button {
    cursor: pointer;
    align-self: flex-start;
  }
  .shot-explorer-controls button.secondary {
    background: #f3f4f6;
  }
  .shot-explorer-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .shot-explorer-summary-card {
    padding: 0.65rem 0.75rem;
    border-radius: 0.5rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
  }
  .shot-explorer-summary-label {
    font-size: 0.8rem;
    color: #6b7280;
    margin-bottom: 0.1rem;
  }
  .shot-explorer-summary-value {
    font-weight: 600;
    font-size: 1.05rem;
    color: #111827;
  }
  .shot-explorer-summary-caption {
    font-size: 0.75rem;
    color: #9ca3af;
  }
  .shot-explorer-charts {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .shot-explorer-chart-block h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }
  .shot-explorer-chart-block p.chart-caption {
    margin: 0 0 0.75rem;
    font-size: 0.8rem;
    color: #6b7280;
  }
  .shot-explorer-tooltip {
    position: fixed;
    pointer-events: none;
    z-index: 1000;
    padding: 0.4rem 0.5rem;
    border-radius: 0.375rem;
    background: rgba(17, 24, 39, 0.95);
    color: white;
    font-size: 0.75rem;
    line-height: 1.2;
    max-width: 220px;
    box-shadow: 0 10px 15px rgba(15, 23, 42, 0.35);
  }
  .shot-explorer-tooltip strong {
    font-weight: 600;
  }
  @media (max-width: 900px) {
    .shot-explorer-layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  `;
  document.head.appendChild(style);
}

function createMultiSelect(label, options, initialValues, onChange, { size = 8 } = {}) {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = label;
  span.className = "control-label";
  const select = document.createElement("select");
  select.multiple = true;
  select.size = size;

  options.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if (initialValues && initialValues.includes(value)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const selected = Array.from(select.selectedOptions).map((o) => o.value);
    onChange(selected);
  });

  wrap.appendChild(span);
  wrap.appendChild(select);
  return wrap;
}

function createSingleSelect(label, options, initialValue, onChange) {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = label;
  span.className = "control-label";
  const select = document.createElement("select");

  options.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if (value === initialValue) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    onChange(select.value);
  });

  wrap.appendChild(span);
  wrap.appendChild(select);
  return wrap;
}

function createSummaryCard(label, caption = "") {
  const card = document.createElement("div");
  card.className = "shot-explorer-summary-card";
  const labelEl = document.createElement("div");
  labelEl.className = "shot-explorer-summary-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("div");
  valueEl.className = "shot-explorer-summary-value";
  valueEl.textContent = "–";
  const captionEl = document.createElement("div");
  captionEl.className = "shot-explorer-summary-caption";
  captionEl.textContent = caption;

  card.appendChild(labelEl);
  card.appendChild(valueEl);
  if (caption) card.appendChild(captionEl);

  return { card, valueEl, captionEl };
}

// Core visualization function (what we used before)
export function shotExplorer(rawRows) {
  injectStyles();

  // --- Data preparation ------------------------------------------------------

  const data = rawRows
    .filter(
      (d) =>
        d.LOC_X != null &&
        d.LOC_Y != null &&
        !Number.isNaN(+d.LOC_X) &&
        !Number.isNaN(+d.LOC_Y)
    )
    .map((d) => {
      const x = +d.LOC_X;
      const yRaw = +d.LOC_Y;
      // Mirror to a single half-court (NBA court length ~94 ft)
      const yHalf = yRaw > 47 ? 94 - yRaw : yRaw;

      // Normalize SHOT_MADE into a real boolean
      const rawMade = d.SHOT_MADE;
      let madeFlag;

      if (typeof rawMade === "boolean") {
        // already true/false
        madeFlag = rawMade;
      } else if (typeof rawMade === "number") {
        // 1 = made, 0 = missed
        madeFlag = rawMade === 1;
      } else {
        // strings like "True", "False", "Made Shot", "Missed Shot", etc.
        const s = String(rawMade).trim().toLowerCase();
        if (s.includes("miss")) {
          madeFlag = false;
        } else if (s.includes("made") || s === "1" || s === "true" || s === "y") {
          madeFlag = true;
        } else {
          // fallback: treat unknown as miss
          madeFlag = false;
        }
      }


      return {
        player: d.PLAYER_NAME,
        team: d.TEAM_NAME,
        made: madeFlag,
        x,
        y: yHalf,
        dist: +d.SHOT_DISTANCE,
        quarter: d.QUARTER,
        mins: d.MINS_LEFT,
        secs: d.SECS_LEFT,
        basicZone: d.BASIC_ZONE,
        shotType: d.SHOT_TYPE,
        actionType: d.ACTION_TYPE,
        rawDate: d.GAME_DATE
      };
      
    });

  // Unique players sorted by attempts (most attempts first)
  const attemptsByPlayer = d3.rollup(
    data,
    (v) => v.length,
    (d) => d.player
  );
  const players = Array.from(attemptsByPlayer.entries())
    .sort((a, b) => d3.descending(a[1], b[1]))
    .map((d) => d[0]);

  // Default: top 5 volume shooters selected
  const defaultPlayers = players.slice(0, 5);

  // Unique teams sorted alphabetically
  const teams = Array.from(new Set(data.map((d) => d.team))).sort(
    d3.ascending
  );

  const maxDist = d3.max(data, (d) => d.dist) ?? 35;

  // --- Root container --------------------------------------------------------

  const root = document.createElement("div");
  root.className = "shot-explorer";

  const heading = document.createElement("h2");
  heading.textContent = "NBA 2003–04 Shot Chart Explorer";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent =
    "Explore where shots came from in the 2003–04 NBA regular season. " +
    "Filter by player, team, shot result, and distance to see how shot selection and efficiency change.";

  root.appendChild(heading);
  root.appendChild(lede);

  const layout = document.createElement("div");
  layout.className = "shot-explorer-layout";
  root.appendChild(layout);

  const controls = document.createElement("div");
  controls.className = "shot-explorer-controls";

  const charts = document.createElement("div");
  charts.className = "shot-explorer-charts";

  layout.appendChild(controls);
  layout.appendChild(charts);

  // --- Controls --------------------------------------------------------------

  let selectedPlayers = defaultPlayers.slice();
  let selectedTeams = teams.slice();
  let resultFilter = "All"; // "All" | "Made" | "Missed"
  let distanceFilter = "All"; // "All" | "0–10" | "10–23" | "23+"
  let brushedExtent = null; // [d0, d1] from distance brush

  const playerSelect = createMultiSelect(
    "Players (multi-select)",
    players,
    selectedPlayers,
    (values) => {
      selectedPlayers = values.length ? values : players.slice();
      redraw();
    },
    { size: 10 }
  );

  const teamSelect = createMultiSelect(
    "Teams (multi-select)",
    teams,
    selectedTeams,
    (values) => {
      selectedTeams = values.length ? values : teams.slice();
      redraw();
    },
    { size: 8 }
  );

  const resultSelect = createSingleSelect(
    "Result",
    ["All", "Made", "Missed"],
    resultFilter,
    (value) => {
      resultFilter = value;
      redraw();
    }
  );

  const distanceSelect = createSingleSelect(
    "Distance mode",
    ["All", "0–10 ft", "10–23 ft", "23+ ft"],
    "All",
    (value) => {
      if (value === "0–10 ft") distanceFilter = "0–10";
      else if (value === "10–23 ft") distanceFilter = "10–23";
      else if (value === "23+ ft") distanceFilter = "23+";
      else distanceFilter = "All";
      redraw();
    }
  );

  const clearBrushButton = document.createElement("button");
  clearBrushButton.textContent = "Clear distance brush";
  clearBrushButton.className = "secondary";
  clearBrushButton.addEventListener("click", () => {
    brushedExtent = null;
  
    // Grab the brush group directly from the SVG and clear it
    const brushG = histSvg.select(".brush");
    if (!brushG.empty()) {
      brushG.call(brush.move, null);   // visually clears selection
    }
  
    redraw();
  });
  
  

  controls.appendChild(playerSelect);
  controls.appendChild(teamSelect);
  controls.appendChild(resultSelect);
  controls.appendChild(distanceSelect);
  controls.appendChild(clearBrushButton);

  // Summary cards
  const summary = document.createElement("div");
  summary.className = "shot-explorer-summary";
  const totalCard = createSummaryCard("Shots", "Number of attempts");
  const fgCard = createSummaryCard("FG%", "Made / attempted");
  const threeCard = createSummaryCard("3P rate", "Share of attempts from 23+ ft");
  const rimCard = createSummaryCard("At rim FG%", "Shots within 4 ft");

  summary.appendChild(totalCard.card);
  summary.appendChild(fgCard.card);
  summary.appendChild(threeCard.card);
  summary.appendChild(rimCard.card);

  controls.appendChild(summary);

  // --- Tooltip ---------------------------------------------------------------

  const tooltip = document.createElement("div");
  tooltip.className = "shot-explorer-tooltip";
  tooltip.style.opacity = 0;
  root.appendChild(tooltip);

  function showTooltip(html, x, y) {
    tooltip.innerHTML = html;
    tooltip.style.opacity = 1;
    const padding = 10;
    tooltip.style.left = `${x + padding}px`;
    tooltip.style.top = `${y + padding}px`;
  }

  function hideTooltip() {
    tooltip.style.opacity = 0;
  }

  // --- Shot chart SVG --------------------------------------------------------

  const courtBlock = document.createElement("div");
  courtBlock.className = "shot-explorer-chart-block";
  const courtTitle = document.createElement("h3");
  courtTitle.textContent = "Half-court shot locations";
  const courtCaption = document.createElement("p");
  courtCaption.className = "chart-caption";
  courtCaption.textContent =
    "Each dot is a field goal attempt from the 2003–04 regular season. " +
    "Green = made, red = missed. Filters and the distance brush below update this view.";

  courtBlock.appendChild(courtTitle);
  courtBlock.appendChild(courtCaption);
  charts.appendChild(courtBlock);

  const courtWidth = 520;
  const courtHeight = 470;
  const courtMargin = { top: 20, right: 20, bottom: 16, left: 20 };

  const courtSvg = d3
  .create("svg")
  .attr("viewBox", [0, 0, courtWidth, courtHeight])
  .attr("width", "100%");

courtBlock.appendChild(courtSvg.node());

const xScale = d3
  .scaleLinear()
  .domain([-25, 25])
  .range([courtMargin.left, courtWidth - courtMargin.right]);

const yScale = d3
  .scaleLinear()
  .domain([0, 47]) // half-court
  .range([courtHeight - courtMargin.bottom, courtMargin.top]);

// NEW: clip path that covers just the court rectangle
const defs = courtSvg.append("defs");
defs.append("clipPath")
  .attr("id", "court-clip")
  .append("rect")
  .attr("x", xScale(-25))
  .attr("y", yScale(47))
  .attr("width", xScale(25) - xScale(-25))
  .attr("height", yScale(0) - yScale(47));

// Apply clip both to court drawing and dots so nothing bleeds outside
const courtG = courtSvg.append("g").attr("clip-path", "url(#court-clip)");
const dotsG = courtSvg.append("g")
  .attr("class", "dots")
  .attr("clip-path", "url(#court-clip)");


  // Very simple half-court drawing
  function drawCourt() {
    const lineColor = "#d1d5db";
    const thick = 2;

    // Baseline
    courtG
      .append("line")
      .attr("x1", xScale(-25))
      .attr("y1", yScale(0))
      .attr("x2", xScale(25))
      .attr("y2", yScale(0))
      .attr("stroke", lineColor)
      .attr("stroke-width", thick);

    // Free throw / lane
    const laneWidth = 16;
    const laneHeight = 19;
    courtG
      .append("rect")
      .attr("x", xScale(-laneWidth / 2))
      .attr("y", yScale(laneHeight))
      .attr("width", xScale(laneWidth / 2) - xScale(-laneWidth / 2))
      .attr("height", yScale(0) - yScale(laneHeight))
      .attr("fill", "none")
      .attr("stroke", lineColor)
      .attr("stroke-width", thick);

    // Free-throw circle (top)
    const ftRadius = 6;
    courtG
      .append("circle")
      .attr("cx", xScale(0))
      .attr("cy", yScale(19))
      .attr("r", xScale(ftRadius) - xScale(0))
      .attr("fill", "none")
      .attr("stroke", lineColor)
      .attr("stroke-width", thick);

    // Rim
    const rimRadius = 0.75;
    courtG
      .append("circle")
      .attr("cx", xScale(0))
      .attr("cy", yScale(4))
      .attr("r", xScale(rimRadius) - xScale(0))
      .attr("fill", "none")
      .attr("stroke", "#f97316")
      .attr("stroke-width", 2.5);

    // Backboard
    courtG
      .append("line")
      .attr("x1", xScale(-3))
      .attr("y1", yScale(4.8))
      .attr("x2", xScale(3))
      .attr("y2", yScale(4.8))
      .attr("stroke", "#6b7280")
      .attr("stroke-width", 3);

    // Three-point arc
    const threeRadius = 22.75;
    const arc = d3
      .arc()
      .innerRadius(xScale(threeRadius) - xScale(0))
      .outerRadius(xScale(threeRadius) - xScale(0))
      .startAngle((-0.9 * Math.PI) / 2)
      .endAngle((Math.PI * 3.9) / 2);

    courtG
      .append("path")
      .attr(
        "transform",
        `translate(${xScale(0)}, ${yScale(4)}) rotate(180)`
      )
      .attr("d", arc)
      .attr("fill", "none")
      .attr("stroke", lineColor)
      .attr("stroke-width", thick);

    // Corner threes
    const cornerDist = 59;
    courtG
      .append("line")
      .attr("x1", xScale(-25))
      .attr("y1", yScale(0))
      .attr("x2", xScale(-25))
      .attr("y2", yScale(cornerDist))
      .attr("stroke", lineColor)
      .attr("stroke-width", thick);

    courtG
      .append("line")
      .attr("x1", xScale(25))
      .attr("y1", yScale(0))
      .attr("x2", xScale(25))
      .attr("y2", yScale(cornerDist))
      .attr("stroke", lineColor)
      .attr("stroke-width", thick);
  }

  drawCourt();

  // --- Distance histogram with brush ----------------------------------------

  const histBlock = document.createElement("div");
  histBlock.className = "shot-explorer-chart-block";
  const histTitle = document.createElement("h3");
  histTitle.textContent = "Shot distance distribution";
  const histCaption = document.createElement("p");
  histCaption.className = "chart-caption";
  histCaption.textContent =
    "Histogram of shot distances in feet. Drag a brush over the bars to restrict the distance range; " +
    "the shot chart and summary update automatically.";

  histBlock.appendChild(histTitle);
  histBlock.appendChild(histCaption);
  charts.appendChild(histBlock);

  const histWidth = 520;
  const histHeight = 150;
  const histMargin = { top: 20, right: 18, bottom: 30, left: 36 };

  const histSvg = d3
    .create("svg")
    .attr("viewBox", [0, 0, histWidth, histHeight])
    .attr("width", "100%");

  histBlock.appendChild(histSvg.node());

  const histG = histSvg
    .append("g")
    .attr(
      "transform",
      `translate(${histMargin.left}, ${histMargin.top})`
    );

  const xDist = d3
    .scaleLinear()
    .domain([0, Math.max(30, maxDist)]) // cap at 30+ for nicer view
    .nice()
    .range([0, histWidth - histMargin.left - histMargin.right]);

  const yDist = d3.scaleLinear().range([
    histHeight - histMargin.top - histMargin.bottom,
    0
  ]);

  const xAxisG = histG
    .append("g")
    .attr(
      "transform",
      `translate(0, ${histHeight - histMargin.top - histMargin.bottom})`
    )
    .attr("class", "x-axis");

  xAxisG
    .call(
      d3
        .axisBottom(xDist)
        .ticks(8)
        .tickFormat((d) => `${d}′`)
    )
    .call((g) =>
      g
        .append("text")
        .attr("x", xDist.range()[1])
        .attr("y", 26)
        .attr("fill", "#6b7280")
        .attr("text-anchor", "end")
        .attr("font-size", 10)
        .text("Distance from hoop (ft)")
    );

  const yAxisG = histG.append("g").attr("class", "y-axis");
  const barsG = histG.append("g").attr("class", "bars");

  const brush = d3
  .brushX()
  .extent([
    [0, 0],
    [
      xDist.range()[1],
      histHeight - histMargin.top - histMargin.bottom
    ]
  ])
  .on("brush end", brushed);

let histBrushG = histG.append("g")
  .attr("class", "brush")
  .call(brush);

function brushed(event) {
  if (!event.selection) {
    brushedExtent = null;
  } else {
    const [x0, x1] = event.selection;
    brushedExtent = [xDist.invert(x0), xDist.invert(x1)];
  }
  redraw();
}



  // --- Filtering + redraw ----------------------------------------------------

  function getFilteredData() {
    let filtered = data;

    if (selectedPlayers.length && selectedPlayers.length < players.length) {
      const set = new Set(selectedPlayers);
      filtered = filtered.filter((d) => set.has(d.player));
    }

    if (selectedTeams.length && selectedTeams.length < teams.length) {
      const set = new Set(selectedTeams);
      filtered = filtered.filter((d) => set.has(d.team));
    }

    if (resultFilter === "Made") {
      filtered = filtered.filter((d) => d.made);
    } else if (resultFilter === "Missed") {
      filtered = filtered.filter((d) => !d.made);
    }    

    if (distanceFilter !== "All") {
      if (distanceFilter === "0–10") {
        filtered = filtered.filter((d) => d.dist <= 10);
      } else if (distanceFilter === "10–23") {
        filtered = filtered.filter((d) => d.dist > 10 && d.dist <= 23);
      } else if (distanceFilter === "23+") {
        filtered = filtered.filter((d) => d.dist > 23);
      }
    }

    if (brushedExtent) {
      const [d0, d1] = brushedExtent;
      filtered = filtered.filter(
        (d) => d.dist >= d0 && d.dist <= d1
      );
    }
    

    return filtered;
  }

  function formatPct(value) {
    if (!Number.isFinite(value)) return "–";
    return (value * 100).toFixed(1) + "%";
  }

  function redraw() {
    const filtered = getFilteredData();

    // --- Summary metrics -----------------------------------------------------
    const attempts = filtered.length;
    const made = filtered.filter((d) => d.made).length;
    const fgPct = attempts ? made / attempts : NaN;

    const threes = filtered.filter((d) => d.dist >= 23).length;
    const threeRate = attempts ? threes / attempts : NaN;

    const rimShots = filtered.filter((d) => d.dist <= 4);
    const rimAttempts = rimShots.length;
    const rimMade = rimShots.filter((d) => d.made).length;
    const rimPct = rimAttempts ? rimMade / rimAttempts : NaN;

    totalCard.valueEl.textContent = attempts.toLocaleString("en-US");
    fgCard.valueEl.textContent = formatPct(fgPct);
    threeCard.valueEl.textContent = formatPct(threeRate);
    rimCard.valueEl.textContent = formatPct(rimPct);

    // --- Shot chart dots -----------------------------------------------------
    const circleRadius = attempts > 5000 ? 1.5 : 2.5;
    const fillOpacity = attempts > 10000 ? 0.5 : 0.75;

    const selection = dotsG.selectAll("circle").data(filtered, (d, i) => i);

    selection.exit().remove();

    const entered = selection
      .enter()
      .append("circle")
      .attr("r", circleRadius)
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("fill", (d) => (d.made ? "#16a34a" : "#dc2626"))
      .attr("fill-opacity", fillOpacity);

    entered
      .on("mouseenter", (event, d) => {
        const labelResult = d.made ? "Made" : "Missed";
        const timing =
          d.mins != null && d.secs != null
            ? `Q${d.quarter}, ${d.mins}:${String(d.secs).padStart(2, "0")} left`
            : `Q${d.quarter}`;
        const html = `
          <div><strong>${d.player}</strong> (${d.team})</div>
          <div>${labelResult} from ${d.dist.toFixed(1)}′ — ${d.basicZone}</div>
          <div>${d.shotType} – ${d.actionType}</div>
          <div>${timing}${d.rawDate ? " · " + d.rawDate : ""}</div>
        `;
        showTooltip(html, event.clientX, event.clientY);
      })
      .on("mousemove", (event) => {
        showTooltip(tooltip.innerHTML, event.clientX, event.clientY);
      })
      .on("mouseleave", () => {
        hideTooltip();
      });

    selection
      .attr("r", circleRadius)
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("fill", (d) => (d.made ? "#16a34a" : "#dc2626"))
      .attr("fill-opacity", fillOpacity);

    // --- Histogram -----------------------------------------------------------
    const binGenerator = d3
      .bin()
      .domain(xDist.domain())
      .thresholds(d3.range(0, xDist.domain()[1] + 1, 2))
      .value((d) => d.dist);

    const bins = binGenerator(filtered);
    const maxCount = d3.max(bins, (b) => b.length) ?? 1;
    yDist.domain([0, maxCount]).nice();

    yAxisG
      .call(d3.axisLeft(yDist).ticks(4))
      .call((g) =>
        g
          .selectAll("text")
          .attr("font-size", 10)
          .attr("fill", "#6b7280")
      )
      .call((g) =>
        g
          .selectAll("path,line")
          .attr("stroke", "#d1d5db")
      );

    const bar = barsG.selectAll("rect").data(bins);

    bar.exit().remove();

    bar.enter()
      .append("rect")
      .merge(bar)
      .attr("x", (d) => xDist(d.x0))
      .attr("y", (d) => yDist(d.length))
      .attr("width", (d) =>
        Math.max(0, xDist(d.x1) - xDist(d.x0) - 1)
      )
      .attr(
        "height",
        (d) =>
          yDist(0) -
          yDist(d.length || 0)
      )
      .attr("fill", "#60a5fa")
      .attr("fill-opacity", 0.7);
  }

  // initial draw
  redraw();

  // Clean tooltip when element is removed
  root.addEventListener("DOMNodeRemovedFromDocument", () => {
    tooltip.remove();
  });

  return root;
}

// DEFAULT EXPORT to match your existing call:
// InteractiveViz({ data, columns, title })
export default function InteractiveViz(opts) {
  // Support being called either with an object or direct array just in case
  const rows = Array.isArray(opts) ? opts : opts.data;
  if (!rows) {
    throw new Error("InteractiveViz: expected opts.data (array of rows)");
  }
  return shotExplorer(rows);
}
