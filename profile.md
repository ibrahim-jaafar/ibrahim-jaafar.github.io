# Ibrahim Jaafar, AI Specialist

Automation, AI agents and business systems. Based in Lebanon (Beirut time), working remotely; available to work US business hours. Open to remote roles and can start immediately.

Website: https://ibrahim-jaafar.github.io · LinkedIn: https://www.linkedin.com/in/ibrahim-jaafar-007270121

I turn complex operational problems into reliable AI systems, including workflow automation, multi-agent systems and secure internal platforms, and take them from first prototype to daily production use.

- AI Specialist at Blue House Films, a film and social media company of about 100 people, since September 2026. Main developer on its 3-person R&D team. Shipped 9 internal tools to production in my first six weeks.
- I build and run my own multi-agent system (Hermes Agent on Telegram), used almost every day.
- 5+ years in engineering and manufacturing at Ghandour Solutions before moving into AI.
- Building with AI since ChatGPT's first release in late 2022.

## How I work

1. **Discover:** I sit with each person and have them walk me through their workflow: where their time goes, which tasks repeat, and which are hardest.
2. **Analyse and research:** I map every step in detail, find where the time and errors actually come from, and research the best available solutions for each problem before deciding what to build.
3. **Plan:** I plan every step, set the KPIs and limits, compare cost options, and wait for approval before building.
4. **Build:** I design the solution around how people already work, then build it and ship it to production.
5. **Adopt:** I train the team on each tool, document it, and keep improving it from their feedback and support tickets.

**n8n vs custom code.** I choose by the job. n8n is fastest for connecting services: credentials, retries, webhooks and schedules are built in, and non-developers can follow a visual workflow. Custom code gives more control, proper testing and version history, and is cheaper at large scale, but means more plumbing to build and maintain. Often the best answer is both: in my agency report demo, the business logic is plain JavaScript with unit tests, and a build step injects it into n8n, so n8n does the plumbing and tested code does the thinking.

## Current role: AI Specialist, Blue House Films (September 2026 – present, remote)

Blue House Films is a film and social media company of about 100 people. I was hired to help the team work faster and more accurately with less repetitive work. I replaced scattered tools and manual workflows with one connected internal platform, and shipped 9 tools to production in my first six weeks.

As the main developer on the 3-person R&D team, I own the platform end to end. I design and build the tools, host and secure the server, and set up the company's GitHub and automated backups. I also review other developers' code, supervise the interns, train employees on each new tool, and run regular AI workshops for the developers. I discover what to build by sitting with each employee and having them walk me through their workflow, then analysing where their time and errors go.

### Ecosystem: one platform for the whole company

- **Before:** every employee had their own tools and their own API keys, with nothing connected. Onboarding a new person was a mess.
- **After:** one connected platform and one source of truth. Every tool plugs into it as a plugin, and everything can be tracked.
- **Onboarding:** a new hire used to collect colleagues' contacts one by one, then download, set up and create an account for each tool. Now they get one account, with colleagues already in chat, company email ready, and the tools their role needs already available.
- **Offboarding:** people who left used to keep access to everything. Now, when HR marks someone as terminated, their sign-in is disabled, every session on every device is ended, and the action is logged in the security log.
- **AI API keys:** employees used to buy their own keys. Now company keys are encrypted and managed in one place. Neither staff nor the tools ever see a key: a tool sends its request to the platform's broker, which checks the person's permission, adds the key on the server, makes the call and returns only the result.
- Role-based access control: each employee sees only the data their role allows.
- Plugin design, so each tool (HR, tasks, chat, mail) can be built and shipped on its own.
- Self-hosted on an Oracle server, with backups to Cloudflare R2.
- Developer documentation: architecture guide, plugin guide, runbook and architecture decision records, so other developers can build plugins on their own. User guides are next.
- On-laptop AI: plugins can run AI models on employees' own laptops. Models download into a shared cache, are used only if they match their fingerprint, and run on engines built into the signed desktop app, so a web page can never introduce code.
- Desktop app for Windows and macOS: signed releases with automatic updates, starts with the computer, keeps running in the tray, and shows unread counts on the taskbar or Dock.
- Platform services: an audit log of every permission decision, a durable event system, scheduled jobs and reminders, alerts in the app or by email and Telegram, and recorded acceptance of each version of the terms of use.
- Scale: about 70,000 lines of code, 1,200+ automated tests and 57 architecture decision records. I made 92% of the commits.
- Tech: Django, PostgreSQL, Django-Q2 jobs, React + Vite, Tauri desktop app, RBAC + audit log.

### Task Manager

- **Before:** tasks were handed out verbally, by email or on WhatsApp, so they got forgotten, deadlines were missed and managers had to chase people for updates.
- **After:** every task has an owner, a status and a deadline. Managers see progress live instead of chasing people, and changes appear on every device instantly.
- Project dashboards with active, pending and completed counts, time estimates and workday totals.
- A yearly activity heatmap per person or per project, so managers can see who is delivering.
- Sub-tasks, a timeline view, an archive and an activity log.
- Tech: React, Django, live updates, role-based access, web + desktop.

### Mail

- **Before:** staff had to log in to Bluehost webmail or set up email on their phones and Outlook, which was hard for non-technical people. Important emails were missed or answered late, and the company had faced phishing attacks with no protection beyond the basics.
- **After:** company email inside the platform with just an email and password, and instant notifications. Every message is checked for phishing and malicious content, and suspicious mail is clearly flagged.
- Every sender labelled Internal, External or "Company, not verified", so spoofed company addresses stand out.
- Warns when replies would go somewhere other than the sender, with one-click "Report phishing".
- Checks sender authentication (SPF, DKIM, DMARC), catches lookalike company domains (such as a "1" for an "l" or Cyrillic letters), flags risky attachments like macro-enabled files, and shows a dangerous link's real address before it opens. All checks run on our own server, with no outside service.
- Remote images blocked by default, so senders can't track when an email is opened.

### Chat

- **Before:** work talk was split between Slack, WhatsApp, email and conversations, depending on the person. Private numbers got shared and announcements were missed.
- **After:** everyone now uses one internal chat instead of paid Slack seats. It's trackable, abuse can be reported to HR with proof, and nobody has to share a private number.
- Private channels, direct and group messages, threads and bookmarks.
- Replies, search across all chats, read receipts, mute and block.

### SRT Cleaner (co-developed)

- **Before:** the list of words to censor in subtitles was passed around on WhatsApp and email. Remote staff missed updates and each writer censored differently, so banned words reached published videos, posts got flagged or restricted, and videos had to be re-edited and re-uploaded.
- **After:** a manager updates the word bank in one place and everyone has it instantly. Censoring follows one standard method, and a 30–90 minute manual editing task now takes seconds. It's in daily use across the company's news platforms.
- Cleans subtitles in English, French and Arabic, and never touches the timestamps.
- Moved from a standalone desktop tool into the platform, with a shared word bank and an activity log.

### Admin panel

- **Before:** every system was checked by hand: logging in to each provider's website and checking storage and backup sizes manually. Some things weren't watched at all.
- **After:** one dashboard shows server health, backups, logins and malicious access attempts, and sends an alert when something needs attention.
- Per-role access control, plus rules for which roles must use two-factor sign-in.
- Company API keys held centrally and assigned to plugins, so staff never handle keys themselves.
- System health, monitoring, backups and alerts, including logins and malicious access attempts.
- "View as role" and audited, read-only "view as user" for safe debugging.
- Scheduled jobs, platform updates and the support ticket queue.

### HR

- **Before:** employee details were kept apart from the tools people used. Access to each tool was given and removed by hand, people who left kept it, and nobody could see who changed what.
- **After:** HR and the owners manage every employee in one place. Setting someone's role gives them exactly the tools they need, every change is logged with who made it, and marking someone as having left cuts their access to every tool at once.
- Employee records: job title, contract type and dates, ID details and status. Assigning a role in the editor also sets the person's access.
- Self-service profiles: each employee updates their own photo, phone, address and emergency contact.
- Cases: when someone reports a chat, HR gets a case. HR can read the reported conversation, talk privately with the reporter, and close the case with a written verdict. The people reported never see the case.
- A full change history for every record and case, plus automatic clean-up of old records.

### Ticket system

Employees report bugs, security issues and feature requests from inside the platform. The developer chats with the person who raised the ticket and marks it resolved, so nothing gets lost in messages.

### Device statistics

- **Before:** when the company wanted to buy or subscribe to new software, nobody could tell whether staff laptops and computers could run it.
- **After:** a dashboard collects the hardware specs of every staff computer, so the company can check before buying, and developers know what hardware to build for. It guided the decisions when the macOS version of the platform was developed.
- **Plugin usage:** a second tab measures the real work done in each tool and its top users, so the company can see which tools people have actually adopted.

### Newsroom engine (working MVP)

A news-intelligence engine for the company's newsrooms.

- Collects news from RSS feeds, GDELT and outlet scraping, then groups articles about the same event into stories across languages using AI embeddings.
- Links names to Wikidata, tags topics with AI, and searches by tags, words and meaning.
- Raises breaking-news alerts and shows verification signals: who confirms a story and where it started.
- Each outlet has a research profile covering ownership, funding and leaning. It starts with 54 outlets in Arabic, English and French.
- A newsroom screen with movable dashboard panels, a search builder, leaderboards of which outlets break stories first, and exports to CSV, JSON and PDF.
- Alerts and AI digests in the app or by email, Telegram and Slack. AI use has daily request and spending caps.
- Planned by studying a leading commercial tool (NewsWhip Spike) feature by feature. About 9,500 lines with 257 automated tests.
- Tech: Django, PostgreSQL + pgvector, React, AI embeddings.

### Insert Suggester (in progress)

An AI tool for script writers, designed to read each block of a video script, work out what it's really about, and propose visual inserts (videos, images, articles, X and Telegram posts) through live search, guided by a bank of past scripts. Candidates are judged by looking at their actual video frames.

The version built by an intern didn't work reliably, so I reviewed its whole codebase, mapped its logic into a diagram and logged about 40 problems. I'm fixing them one by one, each with tests: for example strict JSON schemas for every AI step, multilingual embeddings for the script bank, and dates that are never copied from another event.

## AI agents and automation

I've been building with AI since ChatGPT first came out in late 2022. Today I use Claude Code and other agentic tools every day, and I build my own agents for jobs that would otherwise take hours by hand.

### Agency report automation (live demo)

Demo: https://ibrahim-jaafar.github.io/agency-demo/

A weekly marketing report for two made-up agency clients, a skin clinic and a home-goods store. It pulls each client's leads and ad spend, sends conversions to Meta, checks the data for mistakes in plain code, and writes a short summary a client can read. Visitors can run it on clean data or break the data on purpose and see what the checks catch, then explore the results on a client dashboard.

- **Client dashboard:** each client gets a dashboard like a real agency report: spend, cost per click, leads, cost per lead and results, each with its change (green when it's good news), a funnel from impressions to bookings or orders, spend per campaign, charts, the week's leads and a CSV download. Day, week, month and year views are added up from daily totals, with costs and rates worked out again from the sums, never averaged, and a Live view shows today so far. Impressions, clicks and spend, the history outside the run's week and the live feed are simulated and labelled as such.
- **Checks in code, not AI:** leads with no source, duplicates written differently (+961 vs 0, capital letters), Meta and CRM not matching, totals that don't add up, unusually large orders and events Meta rejects.
- **Edge cases handled:** an empty week shows "no leads yet" instead of dividing by zero, organic leads don't skew cost per lead, cancelled bookings are left out, and Arabic or emoji names survive hashing.
- **Private by design:** the AI only sees totals and warnings, never names, phones or emails. Personal fields sent to Meta are SHA-256 hashed.
- **AI kept honest:** it never types a number; it writes placeholders, each next to its own label, and the code fills in the real values. Its answer must also follow a strict JSON schema. A broken answer is refused and a template summary is used instead.
- **Live:** two n8n workflows on a free server: one plays the customers and saves them in a GoHighLevel sandbox; the other, the report a real client would get, reads them back, sends the conversions to Meta's Conversions API, asks Gemini for the summary, and posts an alert to Slack when a check fires or a run fails. The logic is covered by 160 automated tests.
- Tech: n8n, GoHighLevel API, Meta Conversions API, Gemini (structured output), JavaScript, Supabase.

### Hermes multi-agent system on Telegram

Four bots, each with its own job, built with Hermes Agent. An orchestrator hands out the work and passes requests between them. All four are still running, and I use them almost every day, for myself and for friends.

- **Car specialist:** takes a licence plate, scrapes the car's details, then uses the VIN to check recalls and cross-check the data on other sites. It then starts an Android emulator, turns on a VPN, opens a specific app and fills in the data to pull the car's history, with no manual steps. This is browser and mobile automation from end to end.
- **Trading analyst:** reads the news, pulls live MetaTrader 5 data, backtests strategies, and shows how the news moves the market on a live dashboard.
- **Coding bot:** writes code in my own style and conventions.
- **Orchestrator:** delegates tasks and acts as the middle man. For example, when the trading bot needs new code, it routes the request to the coding bot.
- **Lean by design:** each bot has its own SOUL.md and only the skills and tools its job needs, so it doesn't carry extra context or spend extra tokens.
- **Kanban hand-offs:** the bots deliver tasks to each other through a shared kanban board, so every hand-off is tracked.
- Tech: Hermes Agent, Telegram, web scraping, Android emulator automation.

### Furniture CAD-to-render pipeline

Product photos for a furniture line without a photo shoot. Products designed in SolidWorks are placed into photoreal scenes by Gemini image generation. Because image models get the scale of objects wrong, Claude also builds each scene in Blender through MCP, using the real furniture dimensions.

- 32 reusable scene scripts: importing parts, building rooms, applying materials, lighting and final polish.
- A written standards library (walls, doors, windows, lighting and camera, furniture clearances) that Claude reads before building, so rooms come out at real-world sizes.
- Automated checks that measure furniture clearances and catch overlapping objects before rendering.
- Calibrated scanned fabric materials and Poly Haven textures and lighting for photoreal results.
- Tech: Claude Code, Blender MCP, Gemini image generation, SolidWorks.

### Mosaic: order-to-production system (my own furniture business, in development)

An online store with an admin panel. When an order comes in, the system shows exactly which manufacturing files to cut: the CNC cutting files made while designing each product in SolidWorks. A strict code covers every part of every product and its variants, so each order maps straight to production.

- 21 coded designs so far. Each one links its SolidWorks part files and sizes, and each variant records which parts it is cut from.
- Customers pick the wood or colour for each material, and the price is calculated from real costs: materials, edge banding, hardware, services and markup.
- Admin sections for materials, suppliers, hardware, delivery, categories and the blog, so the whole business runs from one place.
- Storefront with shop and product pages, room collections, cart, customer accounts with delivery addresses and order history, and a blog.
- Tech: Next.js, Supabase, Cloudflare.

## Other projects

### AI, computer vision and media

#### MoneyPrinterTurbo Extended: AI short-video generator

Freelance project for a client who needed more control than the open-source MoneyPrinterTurbo gives. That tool writes a script, narrates it and assembles stock footage into a video. I replaced its interface with a React app and added AI matching between clips and script, so the footage fits what is being said. About 5,300 new lines of code, and the client was satisfied with the result.

- **Footage that matches meaning:** the script is split into sentences, each candidate clip's frames are scored against the sentence with CLIP/SigLIP, and clips are assigned across the whole video at once (Hungarian algorithm) so the best matches aren't used up early.
- **AI script helpers:** writes an attention-grabbing opening hook and turns each part of the script into precise footage search terms.
- **More footage sources:** added YouTube (with browser-session sign-in), Wikimedia and Coverr alongside Pexels and Pixabay; every clip is trimmed and tagged with its source.
- **Clip-review editor:** before rendering, the operator can swap a clip, search again with their own keywords, upload their own footage, stretch a clip across several sentences, trim it, see which clips are already used, then approve.
- **Speed:** frame analyses are cached and computed in parallel in the background, and low-quality frames are scored down.
- **Voice and subtitles:** Chatterbox voice cloning on the GPU and ElevenLabs, with word-level subtitle timing from faster-whisper.
- A gallery of past clips, and automated tests for the new parts.
- Tech: Python, FastAPI, React, CLIP / SigLIP-2, Whisper, FFmpeg

#### PromptForge: multi-provider AI image platform

Built for a social media startup that needed to produce post images at volume. Write one structured prompt and generate images from many AI providers at once (OpenAI, Gemini, Stability, Replicate, fal.ai, Ideogram, Cloudflare, Mistral and others). Each request is adapted to what the chosen model supports.

- **Per-model adaptation:** each request is adjusted to what the chosen model supports (sizes and aspect ratios, negative prompts, reference-image limits, reasoning settings), so one prompt works everywhere.
- **Built for team volume:** templates with variables, brand kits, batch generation, and templates that can be shared and imported between users.
- **Provider monitoring:** each provider's remaining balance, rate limits and usage at a glance.
- **Reliability:** automatic retries, timeouts and limits on parallel requests; a failure at one provider never stops the others.
- Annotated reference images, full generation history, and API keys encrypted at rest (AES-256-GCM). About 22,000 lines of TypeScript.
- Tech: Next.js, TypeScript, SQLite, AES-256-GCM

#### PhoneCam: billboard detection for advertising research

Freelance project for a university professor researching how advertising differs by location. A Windows desktop app that scans recorded video, detects billboards, and exports a folder of billboard images ready for a second AI tool that analyses their content.

- YOLO11, YOLO12 and YOLOv8 presets, including rotated boxes for billboards seen at an angle, with models downloaded on demand.
- Exports straightened, full-resolution crops of every detection. Removing duplicates is left to the analysis step, by design.
- An adjustable confidence threshold drops weak detections, so fewer false billboards end up in the export.
- GPU hardware video decoding and TensorRT engines built from inside the app, for fast processing.
- Speed, CPU, GPU and memory metrics for each stage, used to decide what to optimise next.
- Tech: Python, PySide6, YOLO11/12/v8, TensorRT, FFmpeg/NVDEC, OpenCV

#### Multimodal PDF RAG

A personal project to help university students chat with their PDF documents, including text, tables and images. I compared models and OCR tools, and concluded that reliable answers from complex PDFs need better layout parsing and citation checks.

- Extracted text, tables and images from PDFs into a ChromaDB vector store (Unstructured, LangChain).
- Compared OpenAI, Groq (Llama) and Mistral models for answers and embeddings.
- Summarised each table and image with an AI model so they could be searched alongside the text.
- Tested Azure Document Intelligence and GMFT table detection for reading complex page layouts.
- Built a small chat interface for asking questions about the documents (Flet).
- Tech: LangChain, ChromaDB, OpenAI, Groq, Mistral

#### Arabic ID number reader (prototype)

A test project at Ghandour Solutions for an ID-scanning device: detecting Lebanese ID cards and reading their Arabic numerals. I built the dataset, the augmentation and the training notebooks. It was shelved because reading Arabic numerals reliably needed stronger models than were available to us then.

- Tech: Python, object detection, data augmentation

#### Truck detection and gate control

A client of Ghandour Solutions wanted their gate to open automatically for trucks. The system detects and tracks trucks from a live camera and opens the gate through an Arduino relay.

- Tech: Python, OpenCV, YOLOv5, Arduino

### Software, data and engineering

#### Polymarket trader analyser and strategy simulator

Freelance project for a client who wanted to learn how successful traders work and test strategies safely. Enter a Polymarket account's wallet address and the tool pulls that trader's whole trade history, then breaks down how they trade. Strategies learned this way are then tested in simulators on live market data. It was used for research and simulation only, not live trading.

- **Trade collector:** pulls an account's history from Polymarket's API in 15-minute windows, page by page, skipping duplicates, until it has the number of trades asked for.
- **Strategy analyser:** per market or across all of them, it tells maker trades from taker trades, and charts entry prices, VWAP over time, and cumulative shares, profit and exposure, so the trader's strategy can be read from the data (Streamlit and Plotly).
- **Strategy simulator:** a 10-state decision engine that trades on live prices and order books in dry-run mode, with built-in risk controls: limits on open positions, total exposure and new entries per update, no new entries near expiry, trend confirmation before entering, liquidity checks before buying, and profit targets that adjust as expiry approaches, with hedging to lock in profit when a trade turns. The full logic is documented in a written specification.
- **Market recorder and replay:** records Bitcoin 15-minute up/down markets, with an interactive player to replay them, a live view of every open position, and a dashboard that replays each simulated market's trades and profit.
- Tech: Python, WebSockets, Streamlit, Plotly, Polymarket and Binance APIs

#### ProMapper

Built for a business advisor, who still uses it. Visual project planning: tasks as connected nodes with dependencies, statuses, costs in several currencies, and templates.

- Time, priority, notes and resource fields on every task, with progress tracking per project.
- Cost and budget tracking in several currencies, converted with live exchange rates.
- Reusable project templates and export to several formats.
- Tech: React, Electron, SQLite

#### SecuSearch

Freelance project. A privacy-focused desktop search app that combines results from many search engines and can route traffic through Tor.

- Results from Google, Bing, Yahoo and other engines in one place, without the engines tracking the user directly.
- Shipped as a one-click Windows installer with embedded Python, so non-technical users can set it up themselves.
- Tech: Electron, SearXNG, Tor

#### CurveMill: CNC file optimiser

Internal tool for Ghandour Solutions, built to fix a bottleneck in the company's CNC workflow. It cleans and repairs DXF cutting files and previews how the cutting tool will run. On real files it cut sketch elements from 3,383 to 540, and a 7,014-line pattern down to 274.

- Finds sketch faults (open profiles, duplicate lines, shared corner points) and shows each one as a clickable warning that zooms to it.
- Keeps curves as true splines through import, editing and export, instead of breaking them into small lines.
- Simulates the endmill cutting along the centre, inside or outside of a path, and repairs small gaps within a set tolerance.
- A SolidWorks add-in with its own toolbar, plus a pass that rejoins broken curves into whole ones.
- SolidWorks-style dimensions to place a pattern exactly on the board, a reusable pattern library, and project files to pause and resume a job.
- About 16,000 lines of Python, covered by 225 automated tests.
- Tech: Python, PySide6, C# SolidWorks add-in

#### Flight incident replay for a journalist

A journalist investigating the diversion of flydubai flight FZ1073 needed to see what happened. I merged data from two flight-tracking services into an interactive replay with a 3D view, a map, and altitude, speed and climb-rate charts.

- Play, pause and scrub through the flight, with every view kept in sync.
- A physics simulation of the cabin: it estimates the g-forces from the recorded data and shows how unbelted passengers would have moved between seats and overhead bins, with its assumptions stated on screen.
- Tech: JavaScript, Three.js, uPlot, flight-tracking data

#### Optiforge: AI-assisted CAD/CAE optimisation platform

A freelance project for a researcher: a platform to help engineers improve mechanical designs using simulation, manufacturing constraints, material data, surrogate models and AI-assisted decisions. I wrote the full product requirements document, with stable requirement IDs, version scopes and verification rules, plus architecture decision records and a matrix linking every requirement to its tests. I then set up the codebase: twelve module skeletons with boundaries enforced at build time, four app shells, and early tests proving the core engines (Gmsh meshing, the CalculiX solver, OpenCascade geometry) worked together. The client halted the project at that point for lack of funding.

- Tech: C++, CMake, Qt, VTK, OpenCascade

#### Interactive 3D vehicle viewer

Freelance project for a client building an electric-vehicle app, who wanted to show each user a 3D model of their own car inside the app. It includes the full asset workflow: cleaning and compressing the models in Blender, exporting them for the web, and showing them in the browser. The finished code was handed over to the client.

- Works with any standard 3D car model (GLB/GLTF); the demo uses a BYD Dolphin.
- Shows loading progress while the model downloads.
- Orbit controls so the user can spin and zoom around the car.
- Tech: React, Three.js, React Three Fiber, Blender

#### Electronics and home automation

Home automation for energy metering, automated curtains, climate control and safety, plus Arduino and Raspberry Pi prototypes that connect software to real hardware.

- Tech: Arduino, Raspberry Pi, Sonoff, sensors

## Skills

- **AI and agents:** Claude, Claude Code, OpenAI Codex, Hermes Agent, MCP, OpenAI / Gemini / Groq / Mistral / OpenRouter APIs, structured JSON outputs, LangChain, RAG, embeddings
- **Automation and integration:** REST APIs, webhooks, web scraping, Telegram bots, Android emulator automation, n8n
- **Apps and backend:** Python, TypeScript, React, Next.js, FastAPI, Django, Supabase, Postgres, SQLite, Electron, Tauri, Streamlit and Plotly dashboards
- **Infrastructure:** Oracle Cloud, Cloudflare R2, Vercel, Docker, GitHub, role-based access control
- **Vision and media:** YOLO, OpenCV, TensorRT, CLIP / SigLIP, Whisper, FFmpeg, ElevenLabs
- **Engineering:** SolidWorks (certified), Blender, CNC and 3D printing, Arduino, Raspberry Pi
- **Business systems:** Notion (built a full business hub for Ghandour Solutions), SolidWorks PDM (selected and installed after comparing ERP, PDM and PLM systems)
- **How I work:** workflow discovery with each user, researching the best solution for each problem, planning with KPIs, limits and cost options before building, product requirements and architecture decision records, automated testing, code review, user training and AI workshops

## Experience

- **AI Specialist, Blue House Films** (Sep 2026 – present): see "Current role" above.
- **Freelance Software Developer, Independent** (2023 – present): desktop apps, AI and computer vision systems, data pipelines and automation tools for clients.
- **Product Designer & Machinist, Ghandour Solutions** (2021 – 2026): A company building solar battery systems, industrial machines and custom CNC-made parts. Product design, CAD modelling and CNC machining. I ran, maintained and repaired the FDM 3D printers and 3-axis CNC machines, and did electronics prototyping and automation with Arduino and Raspberry Pi. I was also asked to streamline the company's workflow: I built CurveMill to fix its CNC file bottleneck. I also set up a Notion hub for the business, covering design, manufacturing, sales, finance, inventory, suppliers and staff training. After comparing ERP, PDM and PLM systems, I installed SolidWorks PDM so the engineers always work on the latest approved design files.

## Education

Bachelor's in Mechanical Engineering, almost completed: one module and the final project remained when Lebanon's economic collapse interrupted my studies, and I moved into industry. I started coding while at university.

## Certifications

Anthropic: Claude Code 101, Introduction to Agent Skills, Introduction to Subagents · Certified SOLIDWORKS Design Professional · Certified SOLIDWORKS Additive Manufacturing Associate · PMI: Fundamentals of Predictive Project Management · LinkedIn Learning: Engineering Drawings for Manufacturing, SOLIDWORKS: Advanced Engineering Drawings · HP LIFE: Customer Relationship Management

## Languages

Arabic (native), English (professional), Persian (good)
