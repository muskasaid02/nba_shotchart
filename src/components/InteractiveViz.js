import * as d3 from "d3";

// Parse dates like "03-12-2004"
const parseMDY = d3.timeParse("%m-%d-%Y");

// Simple UI builders (no extra libs)
function createSelect(label, options, value, onChange, {multiple=false, size=6}={}) {
  const wrap = document.createElement("label");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "4px";
  const span = document.createElement("span");
  span.textContent = label;
  span.style.fontWeight = "600";
  const select = document.createElement("select");
  if (multiple) {
    select.multiple = true;
    select.size = Math.min(size, options.length);
  }
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    if (!multiple && o === value) opt.selected = true;
    select.appendChild(opt);
  }
  select.onchange = () => {
    if (multiple) {
      const chosen = Array.from(select.selectedOptions).map(o => o.value);
      onChange(chosen);
    } else {
      onChange(select.value);
    }
  };
  wrap.appendChild(span);
  wrap.appendChild(select);
  return wrap;
}

export default function InteractiveViz(CONFIG) {
  const {
    data: rawData,
    columns,
    title = "Interactive Visualization"
  } = CONFIG;

  const root = document.createElement("div");
  root.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  root.style.maxWidth = "1200px";
  root.style.margin = "0 auto";
  root.style.padding = "1rem";
  root.style.background = "#1a1a1a";
  root.style.color = "#e0e0e0";

  const h2 = document.createElement("h2");
  h2.textContent = title;
  h2.style.margin = "0 0 .5rem 0";
  h2.style.color = "#e0e0e0";
  root.appendChild(h2);

  const controls = document.createElement("div");
  controls.style.display = "grid";
  controls.style.gridTemplateColumns = "repeat(4, minmax(0,1fr))";
  controls.style.gap = ".75rem";
  controls.style.alignItems = "start";
  controls.style.marginBottom = ".75rem";
  root.appendChild(controls);

  const vizWrap = document.createElement("div");
  vizWrap.style.display = "grid";
  vizWrap.style.gridTemplateColumns = "1fr";
  vizWrap.style.gap = ".75rem";
  root.appendChild(vizWrap);

  // SVGs
  const W = 1100;
  const H = 560;
  const scatterSVG = d3.create("svg")
    .attr("width", W)
    .attr("height", H)
    .style("background", "#1a1a1a");
  const histSVG = d3.create("svg")
    .attr("width", W)
    .attr("height", 140)
    .style("background", "#1a1a1a");
  vizWrap.appendChild(scatterSVG.node());
  vizWrap.appendChild(histSVG.node());

  // Tooltip
  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "fixed",
    pointerEvents: "none",
    background: "rgba(0,0,0,0.9)",
    color: "white",
    padding: "8px 10px",
    fontSize: "13px",
    borderRadius: "6px",
    opacity: "0",
    transition: "opacity 120ms",
    border: "1px solid #555"
  });
  document.body.appendChild(tip);

  // Process the pre-loaded CSV data
  const data = rawData.map(d => {
    const out = {...d};
    out.__x = +d[columns.x];
    out.__y = +d[columns.y];
    // Handle both numeric (1/0) and string (TRUE/FALSE) formats
    out.__made = d[columns.made] === "TRUE" || d[columns.made] === true || +d[columns.made] === 1 ? 1 : 0;
    out.__player = d[columns.player];
    out.__team = d[columns.team];
    out.__dist = +d[columns.distance];      // numeric
    out.__date = parseMDY(d[columns.date]); // Date
    out.__q = d[columns.quarter] ? +d[columns.quarter] : null;
    out.__mins = d[columns.minsLeft] ? +d[columns.minsLeft] : null;
    out.__secs = d[columns.secsLeft] ? +d[columns.secsLeft] : null;
    return out;
  });

  // Controls — player & team filters
    let allPlayers = Array.from(new Set(data.map(d => d.__player))).sort();
    let allTeams = Array.from(new Set(data.map(d => d.__team))).sort();

    // defaults: all selected
    let selPlayers = allPlayers.slice(0, Math.min(5, allPlayers.length)); // start with a few for readability
    let selTeams = allTeams.slice();

    const playerSelect = createSelect("Players (multi-select)", allPlayers, null, v => { selPlayers = v; redraw(); }, {multiple: true, size: 8});
    const teamSelect = createSelect("Teams (multi-select)", allTeams, null, v => { selTeams = v; redraw(); }, {multiple: true, size: 8});

    // Made/miss filter
    const mmSelect = createSelect("Result", ["All","Made","Missed"], "All", v => { madeFilter = v; redraw(); });
    let madeFilter = "All";

    // Distance binning (hist brush will also filter)
    const distMode = createSelect("Distance Mode", ["All","0–10","10–23","23+"], "All", v => { distFilter = v; redraw(); });
    let distFilter = "All";

    controls.appendChild(playerSelect);
    controls.appendChild(teamSelect);
    controls.appendChild(mmSelect);
    controls.appendChild(distMode);

    // Shot chart scales — NBA half court coordinates
    // Standard NBA court: LOC_X ~ [-250, 250], LOC_Y ~ [0, 470]
    // We flip Y so basket is on the right (higher Y values to the right)
    const xExtent = d3.extent(data, d => d.__x);
    const yExtent = d3.extent(data, d => d.__y);
    const xDom = xExtent[0] == null ? [-250, 250] : [xExtent[0] - 10, xExtent[1] + 10];
    const yDom = yExtent[0] == null ? [-50, 470] : [Math.min(-50, yExtent[0] - 10), yExtent[1] + 10];

    const M = {top: 10, right: 10, bottom: 10, left: 10};
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;

    const g = scatterSVG.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // X scale maps court X to horizontal screen position
    const x = d3.scaleLinear().domain(xDom).range([0, innerW]);
    // Y scale maps court Y to screen - FLIP so basket (y=0) is on RIGHT
    const y = d3.scaleLinear().domain(yDom).range([innerH, 0]);

    // Draw court once and keep reference for zoom transforms
    const courtGroup = g.append("g").attr("class", "court");
    
    // Draw NBA half-court
    drawHalfCourt(courtGroup, x, y);

    const dots = g.append("g");

    // Zoom/pan (limit to reasonable ranges)
    const zoom = d3.zoom().scaleExtent([0.8, 8]).on("zoom", (event) => {
      const t = event.transform;
      const zx = t.rescaleX(x);
      const zy = t.rescaleY(y);
      // Transform both court and dots together
      courtGroup.attr("transform", t);
      dots.attr("transform", t);
    });
    scatterSVG.call(zoom);

    // Linked histogram with brush on shot distance
    const HM = {top: 10, right: 20, bottom: 26, left: 40};
    const HW = W - HM.left - HM.right;
    const HH = 140 - HM.top - HM.bottom;
    const hg = histSVG.append("g").attr("transform", `translate(${HM.left},${HM.top})`);
    const hx = d3.scaleLinear()
      .domain([0, d3.quantile(data.map(d => d.__dist).filter(Number.isFinite).sort(d3.ascending), 0.99) || 35])
      .range([0, HW]);
    const hAxX = hg.append("g").attr("transform", `translate(0,${HH})`);
    const brushG = hg.append("g");

    let brushedExtent = null;

    function redraw() {
      // Filters
      let filtered = data.filter(d => selPlayers.includes(d.__player) && selTeams.includes(d.__team));
      if (madeFilter === "Made") filtered = filtered.filter(d => d.__made === 1);
      if (madeFilter === "Missed") filtered = filtered.filter(d => d.__made === 0);
      if (distFilter !== "All") {
        if (distFilter === "0–10") filtered = filtered.filter(d => d.__dist <= 10);
        if (distFilter === "10–23") filtered = filtered.filter(d => d.__dist > 10 && d.__dist <= 23);
        if (distFilter === "23+") filtered = filtered.filter(d => d.__dist > 23);
      }
      if (brushedExtent) {
        const [d0, d1] = brushedExtent;
        filtered = filtered.filter(d => d.__dist >= d0 && d.__dist <= d1);
      }

      // Dots
      const U = dots.selectAll("circle").data(filtered, (d,i) => i);
      U.join(
        enter => enter.append("circle")
          .attr("cx", d => x(d.__x))
          .attr("cy", d => y(d.__y))
          .attr("r", 4)
          .attr("fill", d => d.__made ? "#4a90e2" : "#e74c3c") // blue for made, red for missed
          .attr("fill-opacity", 0.7)
          .attr("stroke", d => d.__made ? "#6ba3e8" : "#ec7063")
          .attr("stroke-width", 0.5)
          .on("mousemove", (event, d) => {
            tip.style.opacity = "1";
            const rows = [
              `<b>${d.__player}</b> (${d.__team})`,
              `Result: ${d.__made ? "Made ✓" : "Missed ✗"}`,
              `Distance: ${Number.isFinite(d.__dist) ? d.__dist.toFixed(1) : "NA"} ft`,
              d.__date ? `Date: ${d.__date.toISOString().slice(0,10)}` : "",
              d.__q != null ? `Q${d.__q}  ${d.__mins ?? ""}:${String(d.__secs ?? "").padStart(2,"0")}` : ""
            ].filter(Boolean);
            tip.innerHTML = rows.join("<br>");
            tip.style.left = (event.clientX + 12) + "px";
            tip.style.top = (event.clientY + 12) + "px";
          })
          .on("mouseleave", () => tip.style.opacity = "0"),
        update => update,
        exit => exit.remove()
      );

      // Histogram (recompute from displayed subset? here we use ALL for context)
      const values = data.map(d => d.__dist).filter(Number.isFinite);
      const bins = d3.bin().domain(hx.domain()).thresholds(25)(values);
      const hy = d3.scaleLinear().domain([0, d3.max(bins, b => b.length)]).range([HH, 0]).nice();

      const bars = hg.selectAll("rect.bin").data(bins);
      bars.join(
        enter => enter.append("rect")
          .attr("class", "bin")
          .attr("x", d => hx(d.x0))
          .attr("y", d => hy(d.length))
          .attr("width", d => Math.max(1, hx(d.x1) - hx(d.x0) - 1))
          .attr("height", d => HH - hy(d.length))
          .attr("fill", "#4a90e2")
          .attr("opacity", 0.7),
        update => update
          .attr("x", d => hx(d.x0))
          .attr("y", d => hy(d.length))
          .attr("width", d => Math.max(1, hx(d.x1) - hx(d.x0) - 1))
          .attr("height", d => HH - hy(d.length)),
        exit => exit.remove()
      );

      hAxX.call(d3.axisBottom(hx).ticks(8).tickFormat(d => `${d} ft`))
        .selectAll("text").style("fill", "#e0e0e0");
      hAxX.selectAll("line, path").style("stroke", "#666");

      // Brush for interactive distance filtering
      const brush = d3.brushX()
        .extent([[0, 0], [HW, HH]])
        .on("brush end", ({selection}) => {
          if (!selection) {
            brushedExtent = null;
            redraw();
            return;
          }
          const [x0, x1] = selection.map(hx.invert);
          brushedExtent = [x0, x1];
          redraw();
        });

      brushG.call(brush);
      if (brushedExtent) {
        brushG.call(brush.move, brushedExtent.map(hx));
      }
    }

    function drawHalfCourt(target, sx, sy) {
      // Clear existing court elements
      target.selectAll("*").remove();

      const strokeColor = "#666";
      const strokeWidth = 2;

      // Helper to draw lines
      const line = (x1,y1,x2,y2, style={}) =>
        target.append("line")
          .attr("x1", sx(x1)).attr("y1", sy(y1))
          .attr("x2", sx(x2)).attr("y2", sy(y2))
          .attr("stroke", style.stroke || strokeColor)
          .attr("stroke-width", style.width || strokeWidth)
          .attr("opacity", style.opacity || 1);

      // NBA Half-Court Dimensions (in inches/10 converted to standard coords)
      // Baseline at y=0 (basket end), half-court at y≈470
      // Court width: x ∈ [-250, 250]

      // OUTER BOUNDS
      // Baseline (under basket)
      line(-250, -50, 250, -50);
      // Sidelines
      line(-250, -50, -250, 470);
      line(250, -50, 250, 470);
      // Half-court line (far end in this view)
      line(-250, 470, 250, 470);

      // BASKET & BACKBOARD
      // Hoop center: (0, 52.5) - standard is 5.25 feet from baseline
      const hoopY = 52.5;
      target.append("circle")
        .attr("cx", sx(0))
        .attr("cy", sy(hoopY))
        .attr("r", 9)
        .attr("fill", "none")
        .attr("stroke", "#ff6b35")
        .attr("stroke-width", 2);
      
      // Backboard at y ≈ 40 (4 feet from baseline), width 6 feet = 60 units
      line(-30, 40, 30, 40, {stroke: strokeColor, width: 3});

      // PAINT / KEY (the rectangle under the basket)
      // Width: 16 feet = 160 units (±80 from center)
      // Length: 19 feet = 190 units from baseline
      const paintWidth = 80;
      const paintLength = 190;
      
      target.append("rect")
        .attr("x", sx(-paintWidth))
        .attr("y", sy(paintLength))
        .attr("width", sx(paintWidth) - sx(-paintWidth))
        .attr("height", sy(-50) - sy(paintLength))
        .attr("fill", "none")
        .attr("stroke", strokeColor)
        .attr("stroke-width", strokeWidth);

      // FREE THROW CIRCLE
      // Center at (0, 190) - 19 feet from baseline
      // Radius: 6 feet = 60 units
      const ftY = 190;
      const ftRadius = 60;
      
      // Draw full circle
      target.append("circle")
        .attr("cx", sx(0))
        .attr("cy", sy(ftY))
        .attr("r", ftRadius)
        .attr("fill", "none")
        .attr("stroke", strokeColor)
        .attr("stroke-width", strokeWidth);

      // RESTRICTED AREA (small arc under basket)
      // Radius: 4 feet = 40 units, centered at hoop
      const restrictedRadius = 40;
      const restrictedArc = d3.arc()
        .innerRadius(restrictedRadius)
        .outerRadius(restrictedRadius)
        .startAngle(-Math.PI / 2)  // Start from bottom (-90°)
        .endAngle(Math.PI / 2);     // End at top (90°)
      
      target.append("path")
        .attr("d", restrictedArc())
        .attr("transform", `translate(${sx(0)},${sy(hoopY)})`)
        .attr("fill", "none")
        .attr("stroke", strokeColor)
        .attr("stroke-width", strokeWidth);

      // THREE-POINT LINE
      // Corners: straight lines from baseline to break point
      // Break point: 14 feet from sideline = x = ±220, extends to y ≈ 140
      const cornerX = 220;
      const breakY = 140;
      
      line(-cornerX, -50, -cornerX, breakY);
      line(cornerX, -50, cornerX, breakY);
      
      // Arc portion: 23.75 feet from hoop center = 237.5 units radius
      const threeRadius = 237.5;
      
      // Calculate arc angles
      // Arc goes from left corner break to right corner break
      // The break points are at (±220, 140)
      // We need angle from hoop at (0, hoopY) to break point
      const dx = cornerX;
      const dy = breakY - hoopY;
      const breakAngle = Math.atan2(dy, dx);
      
      const threeArc = d3.arc()
        .innerRadius(threeRadius)
        .outerRadius(threeRadius)
        .startAngle(-breakAngle)   // Left side (negative x)
        .endAngle(breakAngle);      // Right side (positive x)
      
      target.append("path")
        .attr("d", threeArc())
        .attr("transform", `translate(${sx(0)},${sy(hoopY)})`)
        .attr("fill", "none")
        .attr("stroke", strokeColor)
        .attr("stroke-width", strokeWidth);

      // OPTIONAL: Add center court circle for reference
      target.append("circle")
        .attr("cx", sx(0))
        .attr("cy", sy(470))
        .attr("r", 60)
        .attr("fill", "none")
        .attr("stroke", strokeColor)
        .attr("stroke-width", strokeWidth)
        .attr("opacity", 0.3);
    }

    // Initial draw
    redraw();

  // Clean up tooltip if the page unloads
  root.addEventListener("DOMNodeRemovedFromDocument", () => { tip.remove(); });

  return root;
}