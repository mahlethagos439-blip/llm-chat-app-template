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
ADD ALL OF THESE REMAINING ALVNTORA LEARNING AI FEATURES WITHOUT REMOVING OR BREAKING ANY EXISTING FEATURES:

1. ❤️ SMART MOTIVATION & EMOTIONAL SUPPORT
- Detect discouragement, frustration, stress, confusion, loss of confidence, and wanting to give up.
- Respond with honest, supportive, actionable encouragement.
- Understand the reason for the struggle instead of giving generic motivation.
- Give small practical next steps.
- Encourage students without making false promises.

2. 🧠 PERSONALIZED LEARNING ENGINE
- Build a learning profile for each student.
- Track level, subjects, topics, strengths, weaknesses, mistakes, quiz results, exam results, study history, goals, pace, and preferences.
- Use this information to personalize teaching, practice, revision and recommendations.

3. 🔄 ADAPTIVE LEARNING
- Automatically adjust difficulty.
- Give easier explanations when the student struggles.
- Give harder questions when the student is ready.
- Use different explanations, examples, analogies and practice when one explanation does not work.

4. 📷 PHOTO / IMAGE LEARNING
- Allow students to upload or take photos of questions, homework, textbooks, notes and handwritten work.
- Analyze the image.
- Explain it step-by-step.
- Check the student's work and mistakes.

5. 🎤 ADVANCED VOICE LEARNING
- Keep the existing Speak and Stop Voice features.
- Allow voice questions and spoken AI answers.
- Add voice-based learning and language/pronunciation practice where supported.
- Do not break the existing voice system.

6. 🌍 300-LANGUAGE SUPPORT
- Design the platform to support a target of 300 languages.
- Add language selection.
- Translate the learning interface where possible.
- Allow AI learning in the selected language where the underlying AI supports it.
- Do not falsely claim unsupported voice/model capabilities.
- Make the architecture easy to expand to additional languages.

7. 🔁 SMART REVISION
- Detect topics that need revision.
- Recommend what to review.
- Use previous mistakes and weak areas.
- Generate revision questions.
- Track revision progress.
- Implement spaced/repeated review where practical.

8. 📈 AI LEARNING ANALYTICS
- Analyze real student data.
- Show improvement over time.
- Show strongest and weakest topics.
- Show quiz/exam performance.
- Show study consistency.
- Identify topics needing attention.
- Give recommended next actions.
- Never invent statistics.

9. 🎯 LEARNING GOALS
- Allow students to create academic and study goals.
- Track progress toward each goal.
- Connect goals with Study Plan, Planner, Progress, Revision and Dashboard.

10. 🛤️ PERSONAL LEARNING PATH
- Recommend what the student should learn next.
- Identify missing prerequisite knowledge.
- Recommend practice and revision.
- Progress from beginner to advanced according to actual performance.

11. 🏆 ACHIEVEMENTS & MILESTONES
- Add meaningful learning achievements.
- Recognize completed topics, improved scores, completed goals, consistent study and mastered difficult areas.
- Keep achievements focused on personal growth, not unhealthy competition.

12. ⏱️ FOCUS / STUDY SESSIONS
- Start, pause, resume and finish study sessions.
- Track session duration.
- Connect sessions with Study Diary and Progress.
- Show useful study-session statistics.

13. 🏠 STUDENT HOME DASHBOARD
Create a central dashboard showing:
- today's learning recommendation
- current goals
- study plan
- progress
- weak topics
- revision recommendations
- recent achievements
- study sessions
- motivation/support when appropriate
- quick access to major features

14. 📚 HOMEWORK & ASSIGNMENT MODE
- Help students understand homework.
- Give hints before giving complete solutions.
- Explain methods.
- Check the student's attempt.
- Teach rather than simply doing everything for the student.

15. 🧪 SUBJECT-SPECIFIC LEARNING
Support personalized learning/practice for:
- Mathematics
- Physics
- Chemistry
- Biology
- English
- other languages
- Computer Science
- AI
- and additional subjects in the future.

16. 🗂️ NOTES & LEARNING MATERIALS
- Allow students to save and organize notes/materials where supported.
- Allow the AI to use student-provided materials as learning context.
- Help summarize and explain uploaded learning materials.

17. 👤 STUDENT PROFILE & PREFERENCES
Add a profile/settings system for:
- name
- grade/education level
- preferred language
- subjects
- learning goals
- learning preferences
- other appropriate educational settings.

18. 🔔 OPTIONAL REMINDERS & NOTIFICATIONS
- Study reminders.
- Revision reminders.
- Goal reminders.
- Planned-session reminders.
- Make notifications optional and user-controlled.

19. 💰 FREE & PREMIUM ARCHITECTURE
Support:
- Free: $0
- Premium: $1.99/month
- Premium yearly: $14.99/year
- Do not implement fake payment processing.
- Prepare the architecture for real payment integration later.

20. 🔐 PRIVACY & SECURITY
- Protect student data.
- Separate users' data.
- Never expose one student's information to another.
- Do not put secret API keys in frontend code.
- Use secure environment variables/secrets.
- Avoid unnecessary logging of sensitive information.
- Validate user input.

21. 🧩 CONNECT EVERYTHING TOGETHER
Do not make the new features isolated.

Connect:
AI Tutor ↔ Personalization
AI Tutor ↔ Strengths
AI Tutor ↔ Weaknesses
AI Tutor ↔ Progress
AI Tutor ↔ Study Plan
AI Tutor ↔ Quiz
AI Tutor ↔ Exam Mode
AI Tutor ↔ Revision
AI Tutor ↔ Motivation
Quiz ↔ Progress
Exam Mode ↔ Progress
Study Plan ↔ Planner
Study Plan ↔ Goals
Study Diary ↔ Progress
Study Sessions ↔ Study Diary
Weaknesses ↔ Revision
Weaknesses ↔ Personalized Learning
Strengths ↔ Personalized Learning
Feelings Journal ↔ Motivation
Goals ↔ Dashboard
Achievements ↔ Progress
Photo Learning ↔ AI Tutor
Voice Learning ↔ AI Tutor
Language Selection ↔ the whole learning experience.

22. 🧠 UNDERSTANDING-FIRST TEACHING
- Prioritize understanding over memorization.
- Ask what the student already understands.
- Find misconceptions.
- Explain the underlying concept.
- Give examples.
- Ask the student to solve/try.
- Give feedback.
- Gradually increase difficulty.

23. 🤝 AI LEARNING COMPANION
The AI should remember appropriate learning context during the student's experience and behave like a continuous learning companion rather than treating every question as completely unrelated.

24. 🧭 SMART NEXT-ACTION RECOMMENDATIONS
After a lesson, quiz, exam, study session or difficult interaction, recommend the most useful next action based on actual student data.

25. 📊 PERSONALIZED STUDY RECOMMENDATIONS
Recommend:
- what to study today
- what to revise
- what to practice
- what to stop/reduce
- what needs more attention
based on goals, progress and weaknesses.

26. 📝 MISTAKE ANALYSIS
Create a system that records learning mistakes where appropriate and identifies patterns:
- careless mistakes
- conceptual misunderstandings
- recurring weak topics
- difficult question types
Then use these patterns to personalize future teaching and practice.

27. 📚 LEARNING RESOURCE SUPPORT
Where technically possible, allow students to work with their own textbooks, notes, documents and learning resources, while clearly distinguishing student-provided material from AI-generated information.

28. 🌐 ACCESSIBILITY
Make the platform accessible and easy to use:
- mobile-friendly
- readable text
- clear buttons
- keyboard accessibility where applicable
- voice alternatives where supported
- simple navigation.

29. 🛡️ RESPONSIBLE AI
- Never fabricate grades, progress, achievements, statistics or capabilities.
- Clearly indicate when information is uncertain.
- Do not pretend an unavailable API/backend feature is working.
- Protect students from inappropriate content.
- Keep educational responses age-appropriate.

30. ⚙️ SCALABLE ARCHITECTURE
Build the new features in a modular way so ALVNTORA can grow later without rewriting the whole application.

IMPORTANT:
KEEP ALL EXISTING FEATURES EXACTLY AS THEY ARE.
DO NOT DELETE THE EXISTING 13 FEATURE BUTTONS.
DO NOT BREAK THE CURRENT CHAT, VOICE, OR EVENT LISTENERS.
FIRST INSPECT THE EXISTING CODE AND THEN ADD THESE FEATURES TO IT.
