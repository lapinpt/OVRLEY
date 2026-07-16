# CSV activity fixture analysis

## Scope

This analysis covers the sample-table headers of every `.csv` file under `src-tauri/ovrley_core/tests/fixtures/activity`. Other file types and vendor/session preambles such as racer, vehicle, track, date, and comments are outside scope.

The fixtures examined are:

- `Amozoc - TrackAddict.csv`
- `sample AiM.csv`
- `sample LapLegend.csv`
- `sample Racebox.csv`
- `sample RaceChrono.csv`
- `session_20260713_185859_v1.csv`
- `session_20260713_185859_v2.csv`

Synonymous and duplicate source columns are grouped below into one conceptual metric pool.

## Collective metric pool

| Metric family | Reported columns |
| --- | --- |
| Time | Time, UTC Time, Timestamp, Elapsed time |
| Session/lap timing | Lap, Lap Number, Lap #, Session fragment #, Sector Number, Trap name, Predicted Lap Time, Predicted vs Best Lap |
| Position | Latitude, Longitude, GPS Latitude/Longitude, local X-position/Y-position |
| Distance | Distance, Distance 2D, Distance on GPS Speed; both metres and kilometres |
| Speed | GPS Speed, Vehicle Speed, VehSpd1, calculated speed, OBD speed; m/s, km/h, and mph |
| Altitude/elevation | GPS Altitude, Altitude, Pressure Altitude; metres and feet |
| Heading/orientation | Heading, Bearing, GPS Heading |
| Linear acceleration | Accel X/Y/Z, lateral, longitudinal/inline, vertical, combined/XYZ acceleration |
| Angular movement | GPS Gyro, Pitch Rate, Roll Rate, Yaw Rate, X/Y/Z rate of rotation |
| Lean | Calculated lean angle |
| GPS quality | Satellite count, locked satellites, fix type, accuracy, position accuracy, speed accuracy, latitude/longitude accuracy, radius |
| Sampling diagnostics | GPS update flag/delay, GPS/device/accelerometer/gyro/magnetometer update rates |
| Engine speed | RPM, Engine RPM |
| Driver controls | Accelerator-pedal position, throttle position, brake state/position/pedal/pressure, clutch pedal, steering-wheel position |
| Drivetrain/state | Gear/calculated gear, track mode, traction-control retard, launch-control timing |
| Temperatures | Logger, coolant/water, oil, manifold/intake air, ambient air, exhaust-gas temperature |
| Pressures | Atmospheric barometer, barometric pressure, manifold-air pressure, brake pressure, four tire pressures |
| Fuel/combustion | Fuel level/percent/decimal, lambda, target AFR, cylinder AFR, EGO correction |
| Engine tuning | Final ignition advance, knock retard |
| Injection | Main pulse width 1/2, sequential cylinder pulse |
| Electrical | External voltage, battery voltage, total current |
| Magnetometer | X/Y/Z magnetic field |
| Miscellaneous sensors/state | Luminosity, wiper-in-park, safe ignition, MidPO6, hours, tire-set ID, K8 brightness |
| Generic channels | Channel03/04/06/07/08, GenSensIn1/2 |
| Record identity | Record number |

## Existing `RawActivity` support

The current canonical fields are defined by `RawActivity`, `RawSample`, and `ActivityColumns` in `src-tauri/ovrley_core/src/activity/schema.rs`.

| Fixture concept | Canonical field | Qualification |
| --- | --- | --- |
| Relative time | `elapsed_seconds` | Direct after identifying the correct vendor time column |
| Absolute time | `timestamp` | Epoch/clock values must first become RFC 3339 |
| Latitude/longitude | `latitude`, `longitude` | Direct decimal degrees |
| Altitude/elevation | `elevation`, `altitude` | Direct after unit normalization |
| Speed | `speed` | Must become m/s |
| Heading/bearing | `heading` | Degrees |
| Distance | `distance` | Must become cumulative metres |
| Combined acceleration | `g_force` | Only one scalar channel is supported |
| Temperature | `temperature` | Only one generic ambient/device Celsius channel |
| Atmospheric pressure | `air_pressure` | Must become bar |
| Gear | `gear_position` | Numeric discrete value |

The raw model does not support acceleration vectors, lap timing, RPM, accelerator-pedal position, throttle-body position, braking, steering, angular rates, most vehicle temperatures/pressures, or engine channels.

Although `RawActivity` supports generic temperature and pressure, coolant, oil, manifold, tire, brake, and similar channels must not be collapsed into those fields. They are different metrics, not aliases.

## Recommended priority

### Essential for telemetry overlays

Already representable:

- Time alignment
- Latitude/longitude
- Speed
- Distance
- Altitude/elevation
- Heading
- Gear
- A scalar acceleration/G-force value

Important additions for these motorsport fixtures:

- Lap number and lap-relative time
- RPM
- Accelerator-pedal position
- Brake position or pedal percentage
- Lateral and longitudinal acceleration as separate metrics
- Steering-wheel position

These additions unlock the conventional motorsport overlay set. Lap information should be its own canonical lap/session model rather than being squeezed into unrelated numeric telemetry fields.

#### Accelerator-pedal position versus throttle-body position

These are related but distinct metrics and must not be merged when both are present:

- **Accelerator-pedal position** is the driver's requested input, generally expressed as `0-100%`. It is the metric car enthusiasts are typically interested in seeing in a primary visualization because it shows commitment, lifting, and modulation through a corner. It is therefore considered essential for overlays.
- **Throttle-body position** is the actual throttle opening commanded or achieved by the ECU. It is primarily valuable for performance diagnostics and analysis because comparison with accelerator position can reveal drive-by-wire mapping, traction-control intervention, rev limiting, or other ECU behavior.

Throttle-body position can still be visualized, especially alongside accelerator position, but it is not the preferred stand-in for a gas-pedal overlay. If a source only exposes a generically named `Throttle Position`, the UI should label it `Throttle %` without claiming that it represents pedal input.

### Interesting follow-up metrics

- Throttle-body position
- Yaw rate and lean angle
- Coolant, oil, intake-air and ambient temperature
- Brake pressure
- Tire pressures
- Manifold pressure
- Clutch position
- AFR/lambda
- Fuel level
- Battery voltage
- Ignition advance and knock retard
- Traction-control state/retard
- Exhaust-gas temperature
- GPS accuracy/satellite count, especially as diagnostic or quality indicators

### Likely low-value for normal overlays

These may still be worth preserving in parser diagnostics or metadata:

- GPS/device update rates and update flags
- GPS delay, fix type and radius
- Magnetometer axes
- Raw pitch/roll axes when yaw or derived orientation is available
- Luminosity and K8 brightness
- Wiper-in-park, safe-ignition and MidPO6 flags
- Tire-set ID and engine-hours counter
- Electrical total current
- Record number
- Unnamed `Channel03`-style and `GenSensIn` columns

Generic channels must not enter the canonical model until their meaning is explicitly configured or known. Their names are not a stable contract.

## Unit and format collisions

| Collision | Formats found | Required normalization |
| --- | --- | --- |
| Speed | m/s, km/h, mph | Canonical m/s: km/h / 3.6; mph x 0.44704 |
| Distance | Metres and kilometres | Canonical metres: km x 1000 |
| Altitude | Metres and feet; RaceBox unit omitted | Feet x 0.3048; verify RaceBox's vendor contract rather than guessing |
| Time | Elapsed seconds, Unix epoch seconds, apparent seconds-since-midnight, session Date + Time | Select source-specific time semantics; generate elapsed seconds and RFC 3339 timestamp once at ingress |
| Air pressure | kPa in TrackAddict/LapLegend; bar for AiM manifold pressure | Atmospheric kPa / 100 to canonical bar; manifold pressure must remain a separate metric |
| Other pressure | Brake MPa and tire kPa | Separate metrics; MPa x 1000 only if choosing kPa as their canonical unit |
| Acceleration | Named lateral/longitudinal/vertical, generic X/Y/Z, and combined magnitude, all in G | Vendor-specific axis mapping is needed; do not assume X means lateral across formats |
| Angular velocity | deg/s across gyro/rate columns | Units agree, but axis names and device orientation differ |
| Magnetic field | AiM mG, RaceChrono microtesla | `1 mG = 0.1 microtesla` |
| Temperature | Celsius, with AiM headers containing mojibake `Â°C` | Normalize header encoding; keep each temperature's semantic identity |
| Heading | Heading/Bearing/GPS Heading in degrees | Normalize to the canonical 0-360 range |
| Gradient/slope | AiM `GPS Slope` in degrees versus canonical gradient percent | If trustworthy: `tan(degrees) x 100`; the fixture values look suspicious, so validate this channel before use |
| Brake | Boolean/calculated flag, percent position, pedal percent, pressure MPa | These are related but not interchangeable; expose distinct canonical metrics |
| Accelerator/throttle | Accelerator-pedal position and throttle-body position, both percent | Preserve as separate canonical metrics; do not alias one to the other when both exist |
| Fuel mixture | Lambda versus AFR | Do not alias directly; AFR conversion depends on fuel stoichiometry |
| Lap/gear/state | Integers, blanks, `N/A`, and sometimes numeric floats | Parse documented absence explicitly; reject malformed present values |
| GPS accuracy | Metres, AiM position accuracy marked millimetres, plus ambiguous `LatAcc`/`LonAcc` marked G | Normalize only clearly defined accuracy channels; do not infer meaning from misleading names |

## Architectural implication

CSV support should use vendor-aware extractors at ingress. Each extractor should recognize its exact header contract, validate required fields, normalize units and formats once, and emit the canonical internal model. Downstream consumers must never see vendor header names or repeat source-specific conversions.
