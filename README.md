# D-ID Agents API Demo - Express & Vanilla JavaScript

This demo showcases the core features of the D-ID Agents API with Express and vanilla JavaScript. It’s meant as a starting point for your own customizations, demonstrating the API’s basic functionality in a simple, approachable way — not as a production-ready application.

## Features
- Real-time video and audio streaming with D-ID Agents
- Chat and Speak modes (Chat: D-ID’s LLM responses, Speak: repeats textbox input for custom implementations)
- **New:** Fluent streaming + response interruption (Premium+ Agents only)
- Speech-to-text example using the open-source WebSpeech API
- Modern UI with responsive design

## Getting Started

### 1. Clone the Repository
```sh
git clone https://github.com/de-id/agents-api-demo.git
cd agents-sdk-api-main
```

### 2. Install Dependencies
```sh
npm install
```

### 3. Project Structure
- `agents-streams-api.js` — Application logic and D-ID Agents API integration
- `app.js` - HTTP Server
- `api.json` - API Key and Route
- `index.html` — Main HTML file
- `style.css` — Styling
- `package.json` — Project configuration
- `webSpeechAPI.js` — WebSpeech API Speech-to-text support

### 4. Setup your API Key
**Fetch your API key** from the [D-ID Studio](https://studio.d-id.com/account-settings) and paste it in the `api.json` file.

API Documentation - [Basic Authentication](https://docs.d-id.com/reference/basic-authentication)

### 5. Configure Your Agent
**Fetch your Agent ID**:
- From the D-ID Studio: Agent Embed option - `data-agent-id` 
- From API: [GET Agents Endpoint](https://docs.d-id.com/reference/listmyagents)

Paste this value in the `agentID` variable in the `agents-streams-api.js` file.

### 6. Run the App
```sh
node app.js
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

© D-ID. MIT License.
