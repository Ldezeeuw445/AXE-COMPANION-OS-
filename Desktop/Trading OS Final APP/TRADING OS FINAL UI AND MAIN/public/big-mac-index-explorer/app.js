/* ===== Big Mac Index — Interactive Choropleth Map ===== */
/* global d3, topojson */

(function () {
  "use strict";

  // ---------- State ----------
  var bmData = null;
  var worldGeo = null;
  var currentYear = null;
  var selectedCountry = null;
  var sortCol = "name";
  var sortAsc = true;

  // Euro area ISO codes to map EUZ data onto
  var EURO_ISOS = [
    "AUT","BEL","CYP","EST","FIN","FRA","DEU","GRC","IRL",
    "ITA","LVA","LTU","LUX","MLT","NLD","PRT","SVK","SVN","ESP"
  ];

  // ---------- CSS Variable Helper ----------
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---------- DOM Refs ----------
  var slider = document.getElementById("year-slider");
  var yearDisplay = document.getElementById("year-display");
  var mapEl = document.getElementById("map");
  var legendEl = document.getElementById("legend");
  var tooltipEl = document.getElementById("tooltip");
  var tableBody = document.getElementById("table-body");
  var trendChartEl = document.getElementById("trend-chart");
  var trendHeader = document.getElementById("trend-header");

  // ---------- Color Scale ----------
  function getColor(val) {
    if (val == null || isNaN(val)) return null;
    var v = Math.max(-80, Math.min(80, val));
    return d3.scaleLinear()
      .domain([-80, -20, 0, 20, 80])
      .range(["#1a9850", "#66bd63", "#ffffbf", "#f46d43", "#d73027"])
      .clamp(true)(v);
  }

  // ---------- ISO Numeric to Alpha-3 ----------
  var numericToIso = {};
  function buildIdToIso() {
    var mapping = {
      4:"AFG",8:"ALB",12:"DZA",20:"AND",24:"AGO",28:"ATG",32:"ARG",36:"AUS",40:"AUT",
      44:"BHS",48:"BHR",50:"BGD",51:"ARM",52:"BRB",56:"BEL",64:"BTN",68:"BOL",70:"BIH",
      72:"BWA",76:"BRA",84:"BLZ",90:"SLB",96:"BRN",100:"BGR",104:"MMR",108:"BDI",
      112:"BLR",116:"KHM",120:"CMR",124:"CAN",132:"CPV",140:"CAF",144:"LKA",148:"TCD",
      152:"CHL",156:"CHN",158:"TWN",170:"COL",174:"COM",178:"COG",180:"COD",
      188:"CRI",191:"HRV",192:"CUB",196:"CYP",203:"CZE",204:"BEN",208:"DNK",214:"DOM",
      218:"ECU",222:"SLV",226:"GNQ",231:"ETH",232:"ERI",233:"EST",234:"FRO",242:"FJI",
      246:"FIN",250:"FRA",262:"DJI",266:"GAB",268:"GEO",270:"GMB",275:"PSE",276:"DEU",
      288:"GHA",300:"GRC",308:"GRD",320:"GTM",324:"GIN",328:"GUY",332:"HTI",340:"HND",
      344:"HKG",348:"HUN",352:"ISL",356:"IND",360:"IDN",364:"IRN",368:"IRQ",372:"IRL",
      376:"ISR",380:"ITA",384:"CIV",388:"JAM",392:"JPN",398:"KAZ",400:"JOR",404:"KEN",
      408:"PRK",410:"KOR",414:"KWT",417:"KGZ",418:"LAO",422:"LBN",426:"LSO",428:"LVA",
      430:"LBR",434:"LBY",438:"LIE",440:"LTU",442:"LUX",450:"MDG",454:"MWI",458:"MYS",
      462:"MDV",466:"MLI",470:"MLT",478:"MRT",480:"MUS",484:"MEX",492:"MCO",496:"MNG",
      498:"MDA",499:"MNE",504:"MAR",508:"MOZ",512:"OMN",516:"NAM",520:"NRU",524:"NPL",
      528:"NLD",540:"NCL",554:"NZL",558:"NIC",562:"NER",566:"NGA",578:"NOR",586:"PAK",
      591:"PAN",598:"PNG",600:"PRY",604:"PER",608:"PHL",616:"POL",620:"PRT",630:"PRI",
      634:"QAT",642:"ROU",643:"RUS",646:"RWA",682:"SAU",686:"SEN",688:"SRB",694:"SLE",
      702:"SGP",703:"SVK",704:"VNM",705:"SVN",706:"SOM",710:"ZAF",716:"ZWE",724:"ESP",
      728:"SSD",729:"SDN",740:"SUR",748:"SWZ",752:"SWE",756:"CHE",760:"SYR",762:"TJK",
      764:"THA",768:"TGO",780:"TTO",784:"ARE",788:"TUN",792:"TUR",795:"TKM",800:"UGA",
      804:"UKR",807:"MKD",818:"EGY",826:"GBR",834:"TZA",840:"USA",854:"BFA",858:"URY",
      860:"UZB",862:"VEN",887:"YEM",894:"ZMB",10:"ATA"
    };
    Object.keys(mapping).forEach(function(num) {
      numericToIso[num] = mapping[num];
    });
  }

  function getIsoFromFeature(f) {
    return numericToIso[f.id] || null;
  }

  function getDataForIso(iso, year) {
    if (!bmData || !bmData.data[year]) return null;
    var yearData = bmData.data[year];
    if (yearData[iso]) return yearData[iso];
    if (EURO_ISOS.indexOf(iso) !== -1 && yearData["EUZ"]) {
      var euzData = yearData["EUZ"];
      return { n: euzData.n, lp: euzData.lp, dp: euzData.dp, usd: euzData.usd, cc: euzData.cc };
    }
    return null;
  }

  // Returns the data-level ISO for a map feature (maps Euro area countries to EUZ)
  function getDataIsoFromFeature(f) {
    var iso = getIsoFromFeature(f);
    if (!iso) return null;
    if (EURO_ISOS.indexOf(iso) !== -1 && bmData && bmData.data[currentYear] && bmData.data[currentYear]["EUZ"]) {
      return "EUZ";
    }
    return iso;
  }

  // ---------- Initialize ----------
  async function init() {
    try {
      var results = await Promise.all([
        fetch("./data.json").then(function(r) { return r.json(); }),
        fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then(function(r) { return r.json(); })
      ]);
      bmData = results[0];
      worldGeo = results[1];

      slider.max = bmData.years.length - 1;
      slider.value = bmData.years.length - 1;
      currentYear = bmData.years[bmData.years.length - 1];
      yearDisplay.textContent = currentYear;

      buildIdToIso();
      setupMap();
      buildLegend();
      setupTabs();
      setupSlider();
      setupSorting();
      setupMobilePanel();
      update();
    } catch (err) {
      console.error("Init error:", err);
      mapEl.innerHTML = "<p style='padding:2rem;color:#999'>Failed to load data. Please refresh.</p>";
    }
  }

  // ---------- Map Setup ----------
  var mapSvg, mapG, projection, pathGen, countries;

  function setupMap() {
    var rect = mapEl.getBoundingClientRect();
    var w = rect.width || 800;
    var h = rect.height || 500;

    mapSvg = d3.select("#map")
      .append("svg")
      .attr("viewBox", "0 0 " + w + " " + h)
      .attr("preserveAspectRatio", "xMidYMid meet");

    var featureCollection = topojson.feature(worldGeo, worldGeo.objects.countries);

    projection = d3.geoNaturalEarth1()
      .fitSize([w - 20, h - 20], featureCollection)
      .translate([w / 2, h / 2]);

    pathGen = d3.geoPath(projection);
    countries = featureCollection.features;

    // Background
    mapSvg.append("rect")
      .attr("width", w)
      .attr("height", h)
      .attr("fill", cssVar("--color-map-bg"));

    // Graticule
    mapSvg.append("path")
      .datum(d3.geoGraticule10())
      .attr("d", pathGen)
      .attr("fill", "none")
      .attr("stroke", cssVar("--color-map-stroke"))
      .attr("stroke-width", 0.3)
      .attr("stroke-opacity", 0.4);

    mapG = mapSvg.append("g");

    mapG.selectAll("path")
      .data(countries)
      .join("path")
      .attr("d", pathGen)
      .attr("stroke", cssVar("--color-map-stroke"))
      .attr("stroke-width", 0.5)
      .attr("class", "country-path")
      .style("cursor", "pointer")
      .on("mouseover", onMapHover)
      .on("mousemove", onMapMove)
      .on("mouseout", onMapOut)
      .on("click", onMapClick);

    // Zoom
    var zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on("zoom", function(event) {
        mapG.attr("transform", event.transform);
        mapG.selectAll(".country-path")
          .attr("stroke-width", 0.5 / event.transform.k);
      });

    mapSvg.call(zoom);
  }

  // ---------- Update Map Colors ----------
  function updateMap() {
    if (!mapG) return;
    var nodata = cssVar("--color-map-nodata") || "#2a2a2a";
    var strokeColor = cssVar("--color-map-stroke") || "#333";
    var textColor = cssVar("--color-text") || "#e0e0de";

    mapG.selectAll(".country-path")
      .transition()
      .duration(300)
      .attr("fill", function(d) {
        var iso = getIsoFromFeature(d);
        if (!iso) return nodata;
        var entry = getDataForIso(iso, currentYear);
        if (!entry) return nodata;
        return getColor(entry.usd);
      })
      .attr("stroke-width", function(d) {
        var iso = getIsoFromFeature(d);
        if (selectedCountry) {
          var dataIso = (EURO_ISOS.indexOf(iso) !== -1) ? "EUZ" : iso;
          if (dataIso === selectedCountry) return 2;
        }
        return 0.5;
      })
      .attr("stroke", function(d) {
        var iso = getIsoFromFeature(d);
        if (selectedCountry) {
          var dataIso = (EURO_ISOS.indexOf(iso) !== -1) ? "EUZ" : iso;
          if (dataIso === selectedCountry) return textColor;
        }
        return strokeColor;
      });
  }

  // ---------- Legend ----------
  function buildLegend() {
    var canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 14;
    var ctx = canvas.getContext("2d");

    for (var i = 0; i < 180; i++) {
      var val = -80 + (160 * i) / 180;
      ctx.fillStyle = getColor(val);
      ctx.fillRect(i, 0, 1, 14);
    }

    legendEl.innerHTML =
      '<div class="legend-title">Valuation vs USD</div>' +
      '<img src="' + canvas.toDataURL() + '" class="legend-gradient" width="180" height="14" alt="Color legend from green (undervalued) to red (overvalued)">' +
      '<div class="legend-labels" style="width:180px">' +
        '<span class="legend-label">-80%</span>' +
        '<span class="legend-label">0%</span>' +
        '<span class="legend-label">+80%</span>' +
      '</div>';
  }

  // ---------- Tooltip ----------
  function onMapHover(event, d) {
    var iso = getIsoFromFeature(d);
    if (!iso) return;
    var entry = getDataForIso(iso, currentYear);
    if (!entry) return;

    var valSign = entry.usd > 0 ? "+" : "";
    var valClass = entry.usd > 2 ? "over" : entry.usd < -2 ? "under" : "";

    tooltipEl.innerHTML =
      '<div class="tooltip-name">' + entry.n + '</div>' +
      '<div class="tooltip-row"><span>Local price</span><span class="tooltip-val">' + entry.cc + " " + entry.lp.toLocaleString() + '</span></div>' +
      '<div class="tooltip-row"><span>USD equivalent</span><span class="tooltip-val">$' + entry.dp.toFixed(2) + '</span></div>' +
      '<div class="tooltip-valuation ' + valClass + '">' + valSign + entry.usd.toFixed(1) + "% " +
      (entry.usd > 2 ? "overvalued" : entry.usd < -2 ? "undervalued" : "fairly valued") + '</div>';
    tooltipEl.classList.add("visible");

    d3.select(event.currentTarget)
      .raise()
      .attr("stroke", cssVar("--color-text"))
      .attr("stroke-width", 1.5);
  }

  function onMapMove(event) {
    var x = event.clientX + 14;
    var y = event.clientY - 14;
    var tw = tooltipEl.offsetWidth;
    var th = tooltipEl.offsetHeight;
    var ww = window.innerWidth;
    var wh = window.innerHeight;

    tooltipEl.style.left = (x + tw > ww ? event.clientX - tw - 14 : x) + "px";
    tooltipEl.style.top = (y + th > wh ? event.clientY - th - 14 : y) + "px";
  }

  function onMapOut(event, d) {
    tooltipEl.classList.remove("visible");
    var iso = getIsoFromFeature(d);
    var dataIso = iso && (EURO_ISOS.indexOf(iso) !== -1) ? "EUZ" : iso;
    var isSelected = selectedCountry && dataIso === selectedCountry;
    d3.select(event.currentTarget)
      .attr("stroke", isSelected ? cssVar("--color-text") : cssVar("--color-map-stroke"))
      .attr("stroke-width", isSelected ? 2 : 0.5);
  }

  function onMapClick(event, d) {
    var iso = getIsoFromFeature(d);
    if (!iso) return;
    var entry = getDataForIso(iso, currentYear);
    if (!entry) return;

    var dataIso = iso;
    if (EURO_ISOS.indexOf(iso) !== -1 && bmData.data[currentYear]["EUZ"]) {
      dataIso = "EUZ";
    }
    selectCountry(dataIso);
  }

  // ---------- Table ----------
  function updateTable() {
    if (!bmData || !bmData.data[currentYear]) return;
    var yearData = bmData.data[currentYear];
    var rows = [];
    Object.keys(yearData).forEach(function(iso) {
      var d = yearData[iso];
      rows.push({ iso: iso, name: d.n, dp: d.dp, usd: d.usd, lp: d.lp, cc: d.cc });
    });

    rows.sort(function(a, b) {
      var va = a[sortCol];
      var vb = b[sortCol];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    tableBody.innerHTML = rows.map(function(r) {
      var valSign = r.usd > 0 ? "+" : "";
      var valClass = r.usd > 2 ? "val-over" : r.usd < -2 ? "val-under" : "val-neutral";
      var selClass = selectedCountry === r.iso ? "selected" : "";
      return '<tr class="' + selClass + '" data-iso="' + r.iso + '">' +
        "<td>" + r.name + "</td>" +
        "<td>$" + r.dp.toFixed(2) + "</td>" +
        '<td class="' + valClass + '">' + valSign + r.usd.toFixed(1) + "%</td>" +
        "</tr>";
    }).join("");

    tableBody.querySelectorAll("tr").forEach(function(tr) {
      tr.addEventListener("click", function() {
        selectCountry(tr.dataset.iso);
      });
    });
  }

  function setupSorting() {
    document.querySelectorAll(".sortable").forEach(function(th) {
      th.addEventListener("click", function() {
        var col = th.dataset.sort;
        if (sortCol === col) {
          sortAsc = !sortAsc;
        } else {
          sortCol = col;
          sortAsc = col === "name";
        }
        document.querySelectorAll(".sortable").forEach(function(el) {
          el.classList.remove("active-sort");
          el.querySelector(".sort-arrow").textContent = "";
        });
        th.classList.add("active-sort");
        th.querySelector(".sort-arrow").textContent = sortAsc ? "\u25B2" : "\u25BC";
        updateTable();
      });
    });
  }

  // ---------- Country Selection ----------
  function selectCountry(iso) {
    selectedCountry = iso;
    updateMap();
    updateTable();
    updateTrend();
    switchTab("trend");

    // On mobile, open the panel
    var panel = document.getElementById("side-panel");
    if (window.innerWidth <= 900) {
      panel.classList.add("open");
    }
  }

  // ---------- Trend Chart ----------
  function updateTrend() {
    if (!selectedCountry || !bmData) {
      trendHeader.innerHTML = '<p class="trend-hint">Select a country from the map or table</p>';
      trendChartEl.innerHTML = "";
      return;
    }

    var points = [];
    var countryName = "";
    bmData.years.forEach(function(year) {
      var entry = bmData.data[year] ? bmData.data[year][selectedCountry] : null;
      if (entry) {
        points.push({ year: +year, val: entry.usd });
        countryName = entry.n;
      }
    });

    if (points.length === 0) {
      trendHeader.innerHTML = "<h3>" + selectedCountry + "</h3><p class='trend-subtitle'>No data available</p>";
      trendChartEl.innerHTML = "";
      return;
    }

    trendHeader.innerHTML = "<h3>" + countryName + "</h3><p class='trend-subtitle'>% over/undervaluation vs USD over time</p>";

    var rect = trendChartEl.getBoundingClientRect();
    var w = Math.max(rect.width, 280);
    var h = Math.max(rect.height, 200);
    var m = { top: 20, right: 20, bottom: 30, left: 50 };

    trendChartEl.innerHTML = "";

    var svg = d3.select("#trend-chart")
      .append("svg")
      .attr("viewBox", "0 0 " + w + " " + h)
      .attr("preserveAspectRatio", "xMidYMid meet");

    var xScale = d3.scaleLinear()
      .domain(d3.extent(points, function(d) { return d.year; }))
      .range([m.left, w - m.right]);

    var yExtent = d3.extent(points, function(d) { return d.val; });
    var yMax = Math.max(Math.abs(yExtent[0] || 0), Math.abs(yExtent[1] || 0), 20);
    var yScale = d3.scaleLinear()
      .domain([-yMax * 1.1, yMax * 1.1])
      .range([h - m.bottom, m.top]);

    var dividerColor = cssVar("--color-divider") || "#2a2a2a";
    var textMuted = cssVar("--color-text-muted") || "#888";
    var textFaint = cssVar("--color-text-faint") || "#555";
    var surfaceColor = cssVar("--color-surface") || "#1a1a1a";
    var textColor = cssVar("--color-text") || "#eee";
    var overColor = cssVar("--color-over") || "#e74c3c";
    var underColor = cssVar("--color-under") || "#2ecc71";
    var primaryColor = cssVar("--color-primary") || "#4f98a3";

    // Grid
    svg.append("g")
      .selectAll("line")
      .data(yScale.ticks(5))
      .join("line")
      .attr("x1", m.left)
      .attr("x2", w - m.right)
      .attr("y1", function(d) { return yScale(d); })
      .attr("y2", function(d) { return yScale(d); })
      .attr("stroke", dividerColor)
      .attr("stroke-dasharray", "2,4");

    // Zero line
    svg.append("line")
      .attr("x1", m.left)
      .attr("x2", w - m.right)
      .attr("y1", yScale(0))
      .attr("y2", yScale(0))
      .attr("stroke", textFaint)
      .attr("stroke-dasharray", "4,4")
      .attr("stroke-width", 1);

    // Area fill
    var lastVal = points[points.length - 1].val;
    var areaColor = lastVal > 0 ? overColor : underColor;
    var lineColor = lastVal > 0 ? overColor : underColor;

    var area = d3.area()
      .x(function(d) { return xScale(d.year); })
      .y0(yScale(0))
      .y1(function(d) { return yScale(d.val); })
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(points)
      .attr("d", area)
      .attr("fill", areaColor)
      .attr("opacity", 0.1);

    // Line
    var line = d3.line()
      .x(function(d) { return xScale(d.year); })
      .y(function(d) { return yScale(d.val); })
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(points)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", lineColor)
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    // Dots
    svg.selectAll(".tdot")
      .data(points)
      .join("circle")
      .attr("cx", function(d) { return xScale(d.year); })
      .attr("cy", function(d) { return yScale(d.val); })
      .attr("r", points.length > 20 ? 2.5 : 3.5)
      .attr("fill", function(d) { return d.val > 0 ? overColor : underColor; })
      .attr("stroke", surfaceColor)
      .attr("stroke-width", 1.5);

    // X Axis
    // Calculate smart tick spacing based on available width
    var availWidth = w - m.left - m.right;
    var maxTicks = Math.floor(availWidth / 45); // ~45px per tick label
    var step = Math.max(1, Math.ceil(points.length / maxTicks));
    var xTicks = points.filter(function(_, i) { return i % step === 0 || i === points.length - 1; }).map(function(d) { return d.year; });

    var xAxis = svg.append("g")
      .attr("transform", "translate(0," + (h - m.bottom) + ")")
      .call(d3.axisBottom(xScale).tickValues(xTicks).tickFormat(d3.format("d")).tickSize(4));
    xAxis.select(".domain").remove();
    xAxis.selectAll("text").attr("fill", textMuted).style("font-family", "var(--font-mono)").style("font-size", "10px");
    xAxis.selectAll("line").attr("stroke", dividerColor);

    // Y Axis
    var yAxis = svg.append("g")
      .attr("transform", "translate(" + m.left + ",0)")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(function(d) { return d > 0 ? "+" + d + "%" : d + "%"; }).tickSize(4));
    yAxis.select(".domain").remove();
    yAxis.selectAll("text").attr("fill", textMuted).style("font-family", "var(--font-mono)").style("font-size", "10px");
    yAxis.selectAll("line").attr("stroke", dividerColor);

    // Interactive hover
    var hoverLine = svg.append("line")
      .attr("y1", m.top)
      .attr("y2", h - m.bottom)
      .attr("stroke", textFaint)
      .attr("stroke-dasharray", "3,3")
      .style("display", "none");

    var hoverDot = svg.append("circle")
      .attr("r", 5)
      .attr("fill", primaryColor)
      .attr("stroke", surfaceColor)
      .attr("stroke-width", 2)
      .style("display", "none");

    var hoverLabel = svg.append("text")
      .attr("fill", textColor)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("display", "none");

    var bisect = d3.bisector(function(d) { return d.year; }).left;

    svg.append("rect")
      .attr("x", m.left)
      .attr("y", m.top)
      .attr("width", w - m.left - m.right)
      .attr("height", h - m.top - m.bottom)
      .attr("fill", "transparent")
      .on("mousemove", function(event) {
        var coords = d3.pointer(event);
        var mx = coords[0];
        var year = Math.round(xScale.invert(mx));
        var idx = bisect(points, year);
        var p = points[Math.min(idx, points.length - 1)];
        if (!p) return;

        hoverLine.style("display", null)
          .attr("x1", xScale(p.year))
          .attr("x2", xScale(p.year));

        hoverDot.style("display", null)
          .attr("cx", xScale(p.year))
          .attr("cy", yScale(p.val));

        var sign = p.val > 0 ? "+" : "";
        hoverLabel.style("display", null)
          .attr("x", xScale(p.year) + 8)
          .attr("y", yScale(p.val) - 10)
          .text(p.year + ": " + sign + p.val.toFixed(1) + "%");
      })
      .on("mouseout", function() {
        hoverLine.style("display", "none");
        hoverDot.style("display", "none");
        hoverLabel.style("display", "none");
      });
  }

  // ---------- Tabs ----------
  function setupTabs() {
    document.querySelectorAll(".tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        switchTab(tab.dataset.tab);
      });
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll(".tab").forEach(function(t) {
      t.classList.toggle("active", t.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-content").forEach(function(c) {
      c.classList.remove("active");
    });
    document.getElementById(tabName + "-view").classList.add("active");

    if (tabName === "trend") {
      requestAnimationFrame(function() { updateTrend(); });
    }
  }

  // ---------- Slider ----------
  function setupSlider() {
    slider.addEventListener("input", function() {
      var idx = parseInt(slider.value, 10);
      currentYear = bmData.years[idx];
      yearDisplay.textContent = currentYear;
      update();
    });
  }

  // ---------- Mobile Panel ----------
  function setupMobilePanel() {
    var panel = document.getElementById("side-panel");
    var tabs = panel.querySelector(".panel-tabs");

    tabs.addEventListener("click", function(e) {
      if (window.innerWidth <= 900 && !e.target.classList.contains("tab")) {
        panel.classList.toggle("open");
      }
    });
  }

  // ---------- Update All ----------
  function update() {
    updateMap();
    updateTable();
    if (selectedCountry) updateTrend();
  }

  // ---------- Theme Toggle ----------
  (function() {
    var toggle = document.querySelector("[data-theme-toggle]");
    var root = document.documentElement;
    var theme = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.setAttribute("data-theme", theme);

    if (toggle) {
      toggle.addEventListener("click", function() {
        theme = theme === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", theme);
        toggle.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " mode");
        toggle.innerHTML = theme === "dark"
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        // Refresh theme-dependent elements
        buildLegend();
        // Re-render map with new theme colors
        if (mapSvg) {
          mapSvg.select("rect").attr("fill", cssVar("--color-map-bg"));
          updateMap();
        }
      });
    }
  })();

  // ---------- Boot ----------
  init();
})();
