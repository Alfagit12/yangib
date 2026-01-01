require('dotenv').config(); // SpeakMate Backend Server 
const express = require('express'); 
const cors = require('cors'); 
const bodyParser = require('body-parser'); 
const app = express(); const PORT = process.env.PORT || 3000; 
// Middleware 
   app.use(cors({ 
   origin: 'https://speakmateuz.vercel.app', // Vercel frontend URL 
   credentials: true })); 
   app.use(bodyParser.json()); 
   app.use(express.static('public')); 
   // In-memory database (keyinchalik MongoDB/PostgreSQL ishlatish mumkin)
    const users = []; 
    const practiceRecords = [];
    let userIdCounter = 1;
    let recordIdCounter = 1;
     // ============ AUTH ENDPOINTS ============ // 
     // Sign Up
      app.post('/api/auth/signup', (req, res) => { 
        const { name, email, phone, password } = req.body;
         const existingUser = users.find(u => u.email === email);
          if (existingUser) { return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
         } const newUser = { id: userIdCounter++, 
            name, 
            email,
            phone,
            password, // Real loyihada hash qilish kerak (bcrypt) 
            createdAt: new Date(),
             stats: { totalPoints: 0,
                 practicesCompleted: 0,
                  streak: 0,
                   level: 1
                 } 
                };
             users.push(newUser);
            const { password: pwd, ...userWithoutPassword } = newUser;
            res.json({ success: true,
                 message: 'Muvaffaqiyatli ro\'yxatdan o\'tdingiz!',
                  user: userWithoutPassword 
                });
             }); 
     // Login
      app.post('/api/auth/login', (req, res) => { 
        const { email, password } = req.body; 

        const user = users.find(u => u.email === email && u.password === password);
        
        if (!user) { 
            return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
         } 
         
         const { password: pwd, ...userWithoutPassword } = user;

          res.json({
             success: true, 
             message: 'Xush kelibsiz!',
              user: userWithoutPassword 
            }); 
        }); 
        // Get User Stats
     app.get('/api/user/:userId/stats', (req, res) => {
        const userId = parseInt(req.params.userId); 
        const user = users.find(u => u.id === userId);
         if (!user) { 
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' }); 
        }
        
        res.json({ success: true, stats: user.stats });
    
    });

// ============ PRACTICE ENDPOINTS ============

// Get Practice Question
app.get('/api/practice/question/:topic', (req, res) => {
    const { topic } = req.params;

    const questions = {
        hobbies: [
            "What are your hobbies and why do you enjoy them?",
            "Tell me about a hobby you started recently.",
            "How much time do you spend on your hobbies?",
            "Do you prefer indoor or outdoor hobbies? Why?"
        ],
        routine: [
            "Describe your typical daily routine from morning to evening.",
            "What is the first thing you do when you wake up?",
            "How do you organize your day?",
            "What do you usually do in the evening?"
        ],
        travel: [
            "Tell me about a place you would like to visit and why.",
            "Describe the best trip you have ever taken.",
            "Do you prefer traveling alone or with others?",
            "What do you usually pack when you travel?"
        ],
        food: [
            "What is your favorite dish and how do you prepare it?",
            "Do you prefer cooking at home or eating out?",
            "Tell me about a traditional dish from your country.",
            "What kind of food do you dislike?"
        ],
        family: [
            "Tell me about your family members and your relationships with them.",
            "Who are you closest to in your family?",
            "Do you have any siblings? Tell me about them.",
            "What activities do you enjoy doing with your family?"
        ],
        work: [
            "What do you study or what kind of job would you like to have?",
            "Describe your ideal workplace.",
            "What skills do you think are important for your career?",
            "Where do you see yourself in 5 years?"
        ]
    };

    const topicQuestions = questions[topic] || questions.hobbies;
    const randomQuestion = topicQuestions[Math.floor(Math.random() * topicQuestions.length)];

    res.json({
        success: true,
        question: randomQuestion,
        topic
    });
});

// Analyze Speech with AI
app.post('/api/practice/analyze', async (req, res) => {
    const { userId, question, transcript, topic } = req.body;

    if (!transcript || transcript.trim().length === 0) {
        return res.status(400).json({ error: 'Javob bo\'sh bo\'lishi mumkin emas' });
    }

    try {
        // Call Claude API
        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (!apiKey) {
            // Demo mode without API key
            return sendDemoFeedback(req, res);
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                messages: [{
                    role: 'user',
                    content: `Sen professional ingliz tili o'qituvchisan. O'quvchi quyidagi savolga javob berdi:

SAVOL: "${question}"
JAVOB: "${transcript}"

Iltimos, quyidagilarni tahlil qil va O'ZBEKCHA javob ber (JSON formatida):

{
  "pronunciation_score": 1-100 orasida ball,
  "grammar_score": 1-100 orasida ball,
  "fluency_score": 1-100 orasida ball,
  "vocabulary_score": 1-100 orasida ball,
  "overall_score": umumiy ball,
  "positive_points": ["nima yaxshi qilindi", "yana nima yaxshi"],
  "mistakes": ["qanday xatolar bor", "yana qanday xatolar"],
  "suggestions": ["tavsiya 1", "tavsiya 2"],
  "uzbek_explanation": "Umumiy izoh o'zbekcha"
}

Faqat JSON javob ber, boshqa hech narsa yozma.`
                }]
            })
        });

        if (!response.ok) {
            throw new Error('AI javob bermadi');
        }

        const data = await response.json();
        const aiText = data.content[0].text;

        // Parse JSON from AI response
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        const feedback = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

        if (!feedback) {
            return sendDemoFeedback(req, res);
        }

        // Save practice record
        const record = {
            id: recordIdCounter++,
            userId,
            topic,
            question,
            transcript,
            feedback,
            timestamp: new Date()
        };
        practiceRecords.push(record);

        // Update user stats
        if (userId) {
            const user = users.find(u => u.id === parseInt(userId));
            if (user) {
                user.stats.practicesCompleted++;
                user.stats.totalPoints += Math.round(feedback.overall_score);
                user.stats.level = Math.floor(user.stats.totalPoints / 100) + 1;
            }
        }

        res.json({
            success: true,
            feedback,
            recordId: record.id
        });

    } catch (error) {
        console.error('AI tahlil xatolik:', error);
        return sendDemoFeedback(req, res);
    }
});

// Demo feedback (when API key is not available)
function sendDemoFeedback(req, res) {
    const { transcript } = req.body;
    const wordCount = transcript.split(' ').length;

    // Simple scoring based on length and basic checks
    const hasGoodLength = wordCount >= 20;
    const hasCapitalization = /[A-Z]/.test(transcript);
    const hasPunctuation = /[.,!?]/.test(transcript);

    const baseScore = 70;
    let bonus = 0;
    if (hasGoodLength) bonus += 10;
    if (hasCapitalization) bonus += 5;
    if (hasPunctuation) bonus += 5;

    const overallScore = Math.min(baseScore + bonus, 95);

    const feedback = {
        pronunciation_score: overallScore - 5,
        grammar_score: overallScore,
        fluency_score: overallScore + 5,
        vocabulary_score: overallScore - 3,
        overall_score: overallScore,
        positive_points: [
            "Javobingiz tushunarli va aniq",
            "So'zlarni yaxshi tanlagan ekansiz",
            "Gaplarni to'g'ri quryapsiz"
        ],
        mistakes: wordCount < 20 ? ["Javobingiz biroz qisqa, ko'proq detallar qo'shing"] : [],
        suggestions: [
            "Yanada murakkab so'zlardan foydalanishga harakat qiling",
            "Misol va tajribalaringizni bayon qiling",
            "Gaplar o'rtasida tabiiy pauza qiling"
        ],
        uzbek_explanation: `Sizning javobingiz ${overallScore}/100 ball oldi! ${hasGoodLength ? 'Yaxshi hajmda javob berdingiz.' : 'Yana biroz batafsil javob berishga harakat qiling.'} Davom eting!`,
        is_demo: true
    };

    res.json({
        success: true,
        feedback,
        note: 'Bu demo versiyasi. Real AI tahlil uchun ANTHROPIC_API_KEY sozlang.'
    });
}

// Get User Practice History
app.get('/api/practice/history/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const userRecords = practiceRecords.filter(r => r.userId === userId);

    res.json({
        success: true,
        records: userRecords,
        total: userRecords.length
    });
});

// ============ LEADERBOARD ============

app.get('/api/leaderboard', (req, res) => {
    const leaderboard = users
        .map(u => ({
            id: u.id,
            name: u.name,
            totalPoints: u.stats.totalPoints,
            level: u.stats.level,
            practicesCompleted: u.stats.practicesCompleted
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 10);

    res.json({
        success: true,
        leaderboard
    });
});

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'SpeakMate API is running!',
        timestamp: new Date(),
        stats: {
            totalUsers: users.length,
            totalPractices: practiceRecords.length
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 SpeakMate Backend server ishga tushdi: https://loyihabackend.onrender.com`);
    console.log(`📊 API Docs: https://loyihabackend.onrender.com/api/health`);
});