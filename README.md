# NASA Space Apps Challenge 2026 - Lunar Landing Site Navigator

Team **True Larpers** | Local event: **Paris** | Hackathon: **14-15 November 2026** | Theme: **The Next Frontier**

Event site: https://www.spaceappschallenge.org/2026/
Challenge page: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

## Our challenge

**Lunar Landing Site Navigator** (difficulty: Advanced / Intermediate; subjects: Human Exploration, Moon, Software, Space Exploration)

Missions to the Moon's south pole face extreme lighting and communication constraints, and planning them takes careful coordination between science and engineering teams. Tools for determining Sun and Earth positions at candidate landing sites exist, but their complicated interfaces make it hard to evaluate critical information efficiently.

**Goal:** create an intuitive tool or application that lets mission planners, educators, and the public compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the horizon to assess power generation potential and direct-to-Earth communication windows.

## Background

- NASA's Commercial Lunar Payload Services (CLPS) program and other lunar missions depend on careful selection of landing sites and dates.
- The Sun's position determines power for solar arrays and thermal conditions. Earth's position determines whether direct communication is possible without relay satellites.
- This is especially hard at the Moon's south pole (water ice and other valuable resources), where illumination and Earth visibility vary extremely across lunar days and seasons. Small changes in location or date have a big impact.
- Mission timelines often shift (hardware delays, launch delays), so engineers must quickly evaluate alternative sites or dates.
- Existing tools (NASA Quickmap, Moon Trek, JPL Horizons System) are built for detailed analysis and are hard for non-specialists to use for fast scenario comparison. Our tool should bridge that gap.

## Objectives (the solution may include)

- **Interactive site selection and comparison:** curated list of landing sites (Apollo, CLPS targets, other commercial or national missions) plus custom lunar coordinates, with side-by-side comparison.
- **Date and time flexibility:** pick landing dates and times, explore how conditions change across lunar days or seasons.
- **Sun and Earth position visualization:** show Sun and Earth relative to the horizon at a chosen site and date, including time remaining before sunset or Earthset.
- **Power and communication assessment:** solar elevation angle, duration of sunlight, Earth visibility windows.
- **Multiple visualization approaches:** 2D maps, 3D surface views, or other creative representations.
- **Temporal dynamics:** animations or timelines over a lunar day or several days.
- **Accessibility across skill levels:** useful for mission planners, educators, and the general public.

The format is open: web app, mobile app, interactive visualization, educational game, or something else, as long as it makes rapid site evaluation clear and efficient.

## Potential considerations (optional)

**Technical approach**
- Ephemeris data can come from the JPL Horizons System or pre-computed datasets.
- Lunar topography (e.g. LOLA, Lunar Orbiter Laser Altimeter) enables realistic surfaces and accurate horizon calculations.
- No atmosphere on the Moon: the horizon is set by local terrain and the edge of the lunar sphere, with no atmospheric refraction.
- Solar elevation angle is a key power metric and should be prominent.

**User experience**
- Prioritize rapid scenario comparison of multiple site-date combinations.
- Communicate time before sunset or Earthset clearly.
- Make the extreme differences between lunar and terrestrial conditions obvious.
- Help users see why small location or date changes matter so much.

**Data and accuracy**
- Account for actual topography, Earth's libration, and the Moon's orbital variations if possible.
- South pole terrain (steep slopes, deep craters, extreme shadows) is complex.

**Engagement and impact**
- Support coordination between science and engineering teams.
- Help teams react fast when schedule or hardware changes force a new site or date.
- Serve as an educational tool about why lunar mission planning is complex.

## Key dates

- Hackathon: 14-15 November 2026
- Project submission opens Saturday 14 November at 9:00 and closes 15 November (done from the Project tab of our team page on the Space Apps site)
- Participant survey due: 1 December 2026
