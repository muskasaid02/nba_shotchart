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

  const h2 = document.createElement("h2");
  h2.textContent = title;
  h2.style.margin = "0 0 .5rem 0";
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
  const scatterSVG = d3.create("svg").attr("width", W).attr("height", H);
  const histSVG = d3.create("svg").attr("width", W).attr("height", 140);
  vizWrap.appendChild(scatterSVG.node());
  vizWrap.appendChild(histSVG.node());

  // Tooltip
  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "fixed",
    pointerEvents: "none",
    background: "rgba(0,0,0,0.8)",
    color: "white",
    padding: "6px 8px",
    fontSize: "12px",
    borderRadius: "6px",
    opacity: "0",
    transition: "opacity 120ms"
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

    // Shot chart scales — NBA half court coordinates usually:
    // LOC_X ~ [-250, 250], LOC_Y ~ [0, 470]. We'll derive from data with padding.
    const xExtent = d3.extent(data, d => d.__x);
    const yExtent = d3.extent(data, d => d.__y);
    // If dataset is empty or weird, fallback:
    const xDom = xExtent[0] == null ? [-250, 250] : [xExtent[0] - 10, xExtent[1] + 10];
    const yDom = yExtent[0] == null ? [0, 470] : [Math.min(0, yExtent[0] - 10), yExtent[1] + 10];

    const M = {top: 10, right: 10, bottom: 10, left: 10};
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;

    const g = scatterSVG.append("g").attr("transform", `translate(${M.left},${M.top})`);

    const x = d3.scaleLinear().domain(xDom).range([0, innerW]);
    const y = d3.scaleLinear().domain(yDom).range([innerH, 0]);

    // Draw court once and keep reference for zoom transforms
    const courtGroup = g.append("g").attr("class", "court");
    
    // Draw a simple half-court (clean lines)
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
          .attr("fill", d => d.__made ? "#1f77b4" : "#d62728") // blue for made, red for missed
          .attr("fill-opacity", 0.85)
          .on("mousemove", (event, d) => {
            tip.style.opacity = "1";
            const rows = [
              `<b>${d.__player}</b> (${d.__team})`,
              `Result: ${d.__made ? "Made" : "Missed"}`,
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
          .attr("opacity", 0.7),
        update => update
          .attr("x", d => hx(d.x0))
          .attr("y", d => hy(d.length))
          .attr("width", d => Math.max(1, hx(d.x1) - hx(d.x0) - 1))
          .attr("height", d => HH - hy(d.length)),
        exit => exit.remove()
      );

      hAxX.call(d3.axisBottom(hx).ticks(8).tickFormat(d => `${d} ft`));

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
      // We'll draw into `courtGroup` so zoom transforms affect both court & dots
      target.selectAll("*").remove();

      // Helpers in court coordinates:
      const line = (x1,y1,x2,y2) =>
        target.append("line")
          .attr("x1", sx(x1)).attr("y1", sy(y1))
          .attr("x2", sx(x2)).attr("y2", sy(y2))
          .attr("stroke", "#888").attr("stroke-width", 1);

      const arc = (cx, cy, r, start, end) => {
        const a = d3.arc().innerRadius(r).outerRadius(r).startAngle(start).endAngle(end);
        const p = target.append("path").attr("d", a());
        p.attr("transform", `translate(${sx(cx)},${sy(cy)}) scale(1,-1)`).attr("fill","none").attr("stroke","#888");
      };

      // Baseline & sidelines (half court)
      line(-250, 0, 250, 0);           // baseline
      line(-250, 0, -250, 470);
      line(250, 0, 250, 470);
      line(-250, 470, 250, 470);       // half-court line

      // Hoop at (0, 60), backboard y≈40
      const hoop = target.append("circle")
        .attr("cx", sx(0))
        .attr("cy", sy(60))
        .attr("r", 7)
        .attr("fill", "none")
        .attr("stroke", "#888");
      line(-30, 40, 30, 40);           // backboard

      // Paint (key) 16ft wide (±80), from baseline to 190
      target.append("rect")
        .attr("x", sx(-80))
        .attr("y", sy(190))
        .attr("width", sx(80) - sx(-80))
        .attr("height", sy(0) - sy(190))
        .attr("fill", "none")
        .attr("stroke", "#888");

      // Free-throw circle centered at (0, 190), r≈60
      arc(0,190,60,0,Math.PI*2);

      // Restricted area (r≈40) around hoop
      arc(0,60,40,Math.PI*0,Math.PI);

      // Three-point line: straight lines to ~ (±220, 0→140) + arc (r≈238.7) centered at hoop
      line(-220, 0, -220, 140);
      line(220, 0, 220, 140);
      // 3pt arc centered at hoop (0,60), from left to right
      const threeRadius = 238.7;
      arc(0,60,threeRadius, -Math.acos( (220)/threeRadius ), Math.PI + Math.acos( (220)/threeRadius ));
    }

    // Initial draw
    redraw();

  // Clean up tooltip if the page unloads
  root.addEventListener("DOMNodeRemovedFromDocument", () => { tip.remove(); });

  return root;
}