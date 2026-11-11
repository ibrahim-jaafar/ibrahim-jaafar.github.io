# Ibrahim Jaafar

AI Specialist · Automation, AI agents and internal platforms
**Email:** {email}
**Location:** Beirut, Lebanon
**Phone:** +961 81 860 454
**Website:** ibrahim-jaafar.github.io
**LinkedIn:** linkedin.com/in/ibrahim-jaafar-007270121

## Summary

AI specialist who builds AI systems and internal tools that teams use every day. Main developer of a company-wide platform used daily by 50–60 staff, with 9 tools shipped to production in six weeks. Brings 5+ years of engineering and manufacturing experience, and also delivers AI tools for freelance clients across speech editing, image generation and computer vision.

## Experience

### AI Specialist, Blue House Films | Sep 2026 – present, remote
Film and social media company, about 100 staff.

- Built the company's internal platform as main developer on a 3-person R&D team; shipped 9 tools to production in the first six weeks, now used daily by 50–60 staff.
- Replaced Slack, WhatsApp and email for internal work with an in-house chat (about 55 daily users), removing paid Slack seats.
- Built a task manager (about 50 daily users) that gives every task an owner, status and deadline, so managers see progress live instead of chasing updates.
- Co-developed a subtitle cleaner that cut a 30–90 minute manual editing task to seconds; in daily use across the company's news platforms.
- Built company email inside the platform with phishing detection (SPF/DKIM/DMARC checks, lookalike domains, risky attachments) after the company faced phishing attacks.
- Centralised company AI API keys behind a server-side broker with role-based access, so no employee or tool ever sees a key; marking someone as having left cuts their access to every tool at once.
- Took over an intern's AI tool that finds visual inserts for video scripts, found 82 problems and reworked large parts of it. It does in 10–20 minutes the research that took writers hours, sometimes days.
- Built a news-intelligence engine in one week that tracks 54 outlets in three languages and replaced the company's NewsWhip subscription.
- Host and secure the platform on an Oracle Cloud VPS monitored through the admin panel, with immutable Cloudflare R2 backups (30-day lock), backed by 1,400+ automated tests and 60 architecture decision records. Set up CI/CD on GitHub Actions: pull requests are tested, security-scanned and checked for leaked secrets, and backend changes deploy only after the tests pass.
- Review developers' code, supervise interns, train staff on each new tool and run AI workshops for the developers.

### Freelance Software Developer | 2023 – present

- Extended an open-source AI video generator for a client: AI matching between script and footage (CLIP/SigLIP) and a React clip-review editor, about 5,300 new lines.
- Built PromptForge for a social media startup: one prompt generates images from many AI providers at once, with retries, rate limits and encrypted API keys.
- Built a billboard-detection desktop app (YOLO, TensorRT) for a university professor's advertising research, and an interactive flight-incident replay for a journalist.
- Built Word Fix for a content creator: click a misspoken word in a video's transcript, type the right one, and it is re-spoken in their own voice in seconds, replacing hours of re-shooting.

### Product Designer & Machinist, Ghandour Solutions | 2021 – 2026
Solar battery systems, industrial machines and custom CNC-made parts.

- Designed products in SolidWorks and ran CNC machining and 3D printing, including maintenance and repair of the machines.
- Built CurveMill, a CNC file optimiser, to fix the company's file bottleneck; it reduced one pattern from 7,014 lines to 274.
- Selected and installed SolidWorks PDM after comparing ERP, PDM and PLM systems, and built a Notion hub covering design, manufacturing, sales, finance and inventory.
- Built a camera system that detects trucks and opens a client's gate automatically (YOLOv5, Arduino).

## Selected projects

**Agency report automation** · live demo: ibrahim-jaafar.github.io/agency-demo
n8n workflows save leads to GoHighLevel, send conversions to Meta's Conversions API, run data checks in code and alert Slack when something looks wrong. A client dashboard covers any day, week, month or year. The AI summary writes placeholders that code fills in, so it can never invent a figure. 204 automated tests.

**Word Fix: AI word correction for video**
F5-TTS speech editing re-speaks only the wrong word from the audio around it, so the voice, room sound and timing match and the video stays in sync. A forced aligner places the cut and a speech model checks every take. n8n, Whisper, ffmpeg; 48 automated tests.

**Hermes multi-agent system**
Four Telegram bots coordinated by an orchestrator, used almost every day. The car bot runs end to end from a licence plate: scraping, VIN recall checks, then an Android emulator to pull the car's history.

**Furniture CAD-to-render pipeline**
Product images without a photo shoot: Claude builds each scene in Blender through MCP at real dimensions, and Gemini renders it photoreal. 32 reusable scene scripts.

Check all projects at ibrahim-jaafar.github.io/#projects

## Skills

- **AI / LLM engineering:** Claude Code, MCP, Hermes Agent, LLM APIs (Anthropic, OpenAI GPT, Gemini, OpenRouter, Replicate), prompt engineering, structured outputs, RAG, embeddings, LangChain, Hugging Face Transformers, Microsoft Foundry, generative AI evaluation
- **Automation:** n8n, REST APIs, webhooks, web scraping, GoHighLevel API, Meta Conversions API, Slack API, Google Docs API and service accounts
- **Development:** Python, TypeScript, React, Next.js, Django, FastAPI, PostgreSQL, Supabase, Tauri
- **Infrastructure:** Oracle Cloud, Cloudflare R2, Docker, GitHub Actions (CI/CD), role-based access control
- **Computer vision and speech:** YOLO, OpenCV, TensorRT, CLIP / SigLIP, Whisper, F5-TTS
- **Engineering:** SolidWorks (certified), Blender, CNC machining, Arduino

## Education

Bachelor's studies in Mechanical Engineering (not completed)

## Certifications

Anthropic: Claude Code 101, Introduction to Agent Skills, Introduction to Subagents, Introduction to Model Context Protocol · Certified SOLIDWORKS Design Professional · Certified SOLIDWORKS Additive Manufacturing Associate · PMI: Fundamentals of Predictive Project Management

## Languages

Arabic (native) · English (professional)
