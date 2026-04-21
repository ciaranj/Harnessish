# Harnessish

> [!CAUTION]
> **DO NOT USE THIS HARNESS IN PRODUCTION, OR ANYWHERE YOU CARE ABOUT YOUR DATA.** This project is for experimental purposes only and contains no safety protections. The author takes no responsibility or liability for any adverse consequences resulting from its use.

## Purpose

**Harnessish** is an experimental AI harness designed for me to explore and understand tool-calling patterns in modern AI frameworks and protocols (such as the Model Context Protocol). It serves as a personal sandbox for testing how LLMs interact with local tools and environments in a controlled, yet unshielded, manner. A fundamental desire of this little project is to see how far we can go with Open models and Open associated tools (e.g. LLAMA-CPP and SearXNG) in a homelab, with just 16GB of VRAM, can go to bootstrap itself up. The initial commits were hand crafted, but as soon as the agent loop was in place the tool was used to build itself with Gemma4 running on, with only the occasional bit of help from Anthropic's Sonnet when Gemma4 got too stuck in loops, early doors.

It is currently configured to work with **[llama-cpp](https://github.com/ggml-org/llama.cpp)** for local model execution and web search is provided through access to a [searxng](https://github.com/searxng/searxng) instance.

## Getting Started

### Prerequisites

- **Node.js** (Latest LTS recommended)
- **npm** or **yarn**
- **llama-cpp server** installed and running locally
- A model configured in llama-cpp (e.g., `unsloth/gemma-4-26B-A4B-it-GGUF:UD-Q6_K_XL`)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ciaranj/Harnessish.git
   cd Harnessish
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration

Create a `.env` file in the root directory based on the `.env.example` template:

```env
OLLAMA_URL=http://localhost:11434/api
MODEL=gemma3
SEARXNG_URL=http://localhost:8888/
```

## Development

### Running in Development Mode

To run the project with hot-reloading (using `tsx`):

```bash
npm run dev
```

### Building the Project

To compile the TypeScript code into the `build/` directory:

```bash
npm run build
```

### Running the Built Application

Once built, you can run the compiled JavaScript:

```bash
npm run start
```

## Technologies Used

- **TypeScript** - For type-safe development.
- **Ink** - A React-based CLI component library for building beautiful terminal interfaces.
- **llama-cpp** - For local LLM orchestration.
- **Model Context Protocol (MCP) SDK** - To explore standardized tool-calling interfaces.
- **React** - Utilized via Ink for the terminal UI.

## License

This project is licensed under the [Apache-2.0](LICENSE) License.
