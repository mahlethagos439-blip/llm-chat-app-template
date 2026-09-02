/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

// Chat state
let chatHistory = [
	{
		role: "assistant",
		content:
			"Hello! I'm an LLM chat app powered by Cloudflare Workers AI. How can I help you today?",
	},
];
let isProcessing = false;

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
	const message = userInput.value.trim();

	// Don't send empty messages
	if (message === "" || isProcessing) return;

	// Disable input while processing
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	// Add user message to chat
	addMessageToChat("user", message);

	// Clear input
	userInput.value = "";
	userInput.style.height = "auto";

	// Show typing indicator
	typingIndicator.classList.add("visible");

	// Add message to history
	chatHistory.push({ role: "user", content: message });

	try {
		// Create new assistant response element
		const assistantMessageEl = document.createElement("div");
		assistantMessageEl.className = "message assistant-message";
		assistantMessageEl.innerHTML = "<p></p>";
		chatMessages.appendChild(assistantMessageEl);
		const assistantTextEl = assistantMessageEl.querySelector("p");

		// Scroll to bottom
		chatMessages.scrollTop = chatMessages.scrollHeight;

		// Send request to API
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: chatHistory,
			}),
		});

		// Handle errors
		if (!response.ok) {
			throw new Error("Failed to get response");
		}
		if (!response.body) {
			throw new Error("Response body is null");
		}

		// Process streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = "";
		let buffer = "";
		const flushAssistantText = () => {
			assistantTextEl.textContent = responseText;
			chatMessages.scrollTop = chatMessages.scrollHeight;
		};

		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				// Process any remaining complete events in buffer
				const parsed = consumeSseEvents(buffer + "\n\n");
				for (const data of parsed.events) {
					if (data === "[DONE]") {
						break;
					}
					try {
						const jsonData = JSON.parse(data);
						// Handle both Workers AI format (response) and OpenAI format (choices[0].delta.content)
						let content = "";
						if (
							typeof jsonData.response === "string" &&
							jsonData.response.length > 0
						) {
							content = jsonData.response;
						} else if (jsonData.choices?.[0]?.delta?.content) {
							content = jsonData.choices[0].delta.content;
						}
						if (content) {
							responseText += content;
							flushAssistantText();
						}
					} catch (e) {
						console.error("Error parsing SSE data as JSON:", e, data);
					}
				}
				break;
			}

			// Decode chunk
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					buffer = "";
					break;
				}
				try {
					const jsonData = JSON.parse(data);
					// Handle both Workers AI format (response) and OpenAI format (choices[0].delta.content)
					let content = "";
					if (
						typeof jsonData.response === "string" &&
						jsonData.response.length > 0
					) {
						content = jsonData.response;
					} else if (jsonData.choices?.[0]?.delta?.content) {
						content = jsonData.choices[0].delta.content;
					}
					if (content) {
						responseText += content;
						flushAssistantText();
					}
				} catch (e) {
					console.error("Error parsing SSE data as JSON:", e, data);
				}
			}
			if (sawDone) {
				break;
			}
		}

		// Add completed response to chat history
		if (responseText.length > 0) {
			chatHistory.push({ role: "assistant", content: responseText });
		}
	} catch (error) {
		console.error("Error:", error);
		addMessageToChat(
			"assistant",
			"Sorry, there was an error processing your request.",
		);
	} finally {
		// Hide typing indicator
		typingIndicator.classList.remove("visible");

		// Re-enable input
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;
	messageEl.innerHTML = `<p>${content}</p>`;
	chatMessages.appendChild(messageEl);

	// Scroll to bottom
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);

		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}
// ========================================
// ALVNTORA AI - VOICE INPUT
// ========================================

(function () {
    const input = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");

    if (!input || !sendButton) return;

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.log("Voice input is not supported in this browser.");
        return;
    }

    const voiceButton = document.createElement("button");
    voiceButton.type = "button";
    voiceButton.textContent = "🎤 Speak";

    sendButton.parentNode.insertBefore(voiceButton, sendButton);

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    voiceButton.addEventListener("click", () => {
        recognition.start();
        voiceButton.textContent = "🔴 Listening...";
    });

    recognition.addEventListener("result", (event) => {
        input.value = event.results[0][0].transcript;
        voiceButton.textContent = "🎤 Speak";
        sendButton.click();
    });

    recognition.addEventListener("end", () => {
        voiceButton.textContent = "🎤 Speak";
    });

    recognition.addEventListener("error", () => {
        voiceButton.textContent = "🎤 Speak";
    });
})();
// ========================================
// ALVNTORA AI - VOICE OUTPUT
// ========================================

(function () {
    if (!("speechSynthesis" in window)) {
        console.log("Voice output is not supported in this browser.");
        return;
    }

    const chat = document.getElementById("chat-messages");
    if (!chat) return;

    let speakTimer = null;
    let lastSpokenText = "";

    function speakLatestAnswer() {
        const messages = chat.querySelectorAll(".assistant-message");
        if (!messages.length) return;

        const latest = messages[messages.length - 1];
        const text = latest.innerText.trim();

        if (!text || text === lastSpokenText) return;

        lastSpokenText = text;

        window.speechSynthesis.cancel();

        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = "en-US";
        speech.rate = 0.95;
        speech.pitch = 1;

        window.speechSynthesis.speak(speech);
    }

    const observer = new MutationObserver(() => {
        clearTimeout(speakTimer);

        speakTimer = setTimeout(() => {
            speakLatestAnswer();
        }, 1200);
    });

    observer.observe(chat, {
        childList: true,
        subtree: true,
        characterData: true
    });

    const stopButton = document.createElement("button");
    stopButton.type = "button";
    stopButton.textContent = "🔇 Stop Voice";

    stopButton.addEventListener("click", () => {
        window.speechSynthesis.cancel();
    });

    chat.parentNode.insertBefore(stopButton, chat.nextSibling);
})();
// ========================================
// ALVNTORA LEARNING AI - REAL FEATURE CONNECTIONS
// ========================================

(function () {
    const input = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");

    if (!input || !sendButton) return;

    const features = {
        "tutor-button":
            "Act as my personal AI tutor. Teach me step by step, explain simply, check my understanding, and adapt to my level.",

        "quiz-button":
            "Quiz me on the subject I choose. Ask one question at a time, wait for my answer, score me, explain mistakes, and increase difficulty when I improve.",

        "study-plan-button":
            "Create a personalized study plan for me. Ask about my subjects, available study time, goals, and exam date, then make a realistic daily and weekly plan.",

        "exam-button":
            "Enter exam preparation mode. Give me exam-style questions, let me answer, mark my answers, explain mistakes, track my weak areas, and gradually increase difficulty.",

        "progress-button":
            "Help me review my learning progress. Ask what I have studied, what I understand, my quiz results, and my difficulties, then give me a progress summary and recommendations.",

        "diary-button":
            "Open my study diary. Help me record what I studied today, what I understood, what I found difficult, and what I should study next.",

        "feelings-button":
            "Help me reflect on how I feel about my learning today. Ask gentle questions and give supportive, practical advice for studying.",

        "reflection-button":
            "Guide me through a daily learning reflection: what went well, what was difficult, what I learned, and what I will improve tomorrow.",

        "strength-button":
            "Help me identify my academic strengths. Ask me questions about my subjects, study habits, quiz results, and learning experiences, then explain my strengths and how to use them.",

        "weakness-button":
            "Help me identify my academic weaknesses. Ask questions, analyze my mistakes and difficulties, and create a plan to improve them.",

        "planner-button":
            "Help me organize my studies. Build a practical schedule around my subjects, priorities, available time, exams, and goals.",

        "writing-button":
            "Help me improve my writing. Check my writing, explain my mistakes clearly, suggest improvements, and help me become a stronger writer.",

        "music-button":
            "Help me use music and sound productively while studying. Suggest study-friendly approaches and explain when music may help or distract me."
    };

    Object.keys(features).forEach(function (buttonId) {
        const button = document.getElementById(buttonId);

        if (!button) return;

        button.addEventListener("click", function () {
            input.value = features[buttonId];
            input.focus();
            sendButton.click();
        });
    });
})();
