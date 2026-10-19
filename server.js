require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Init
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("चेतावनी: .env फ़ाइल में SUPABASE_URL या SUPABASE_KEY नहीं मिला!");
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

// Uploads फोल्डर तैयार रखें
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Voter Key Fingerprint
const getVoterIdentifier = (req, res) => {
  let voterId = req.cookies.voter_id;
  if (!voterId) {
    voterId = uuidv4();
    res.cookie('voter_id', voterId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
  }
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  return `${voterId}_${clientIp}`;
};

// 1. होमपेज
app.get('/', async (req, res) => {
  try {
    const { district, category } = req.query;
    let query = supabase.from('polls').select('*, options(*)').order('created_at', { ascending: false });

    if (district && district !== 'all') {
      query = query.or(`district.eq.${district},district.eq.सभी`);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data: polls, error } = await query;
    if (error) throw error;

    const formattedPolls = (polls || []).map(p => ({
      id: p.id,
      title: p.title,
      category: p.category,
      state: p.state,
      district: p.district,
      samiti: p.samiti,
      totalVotes: p.total_votes || 0,
      options: p.options || []
    }));

    res.render('index', { 
      polls: formattedPolls, 
      selectedDistrict: district || 'all',
      selectedCategory: category || 'all' 
    });
  } catch (err) {
    console.error('Home Page Error:', err.message);
    res.status(500).send("डेटा लोड करने में समस्या आई।");
  }
});

// 2. नया पोल पेज
app.get('/create', (req, res) => {
  res.render('create');
});

// 3. नया पोल बनाएं (इमेज के साथ)
app.post('/api/polls/create', upload.array('optionImages', 10), async (req, res) => {
  try {
    const { title, category, state, district, samiti, options } = req.body;

    if (!title || !options) {
      return res.status(400).send("शीर्षक और विकल्प अनिवार्य हैं।");
    }

    const rawOptions = Array.isArray(options) ? options : [options];
    const cleanOptions = rawOptions.filter(o => o && o.trim() !== "");

    if (cleanOptions.length < 2) {
      return res.status(400).send("कम से कम 2 सही विकल्प डालें।");
    }

    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .insert([{
        title: title.trim(),
        category: category || "सामान्य",
        state: state || "राजस्थान",
        district: district || "सभी",
        samiti: samiti || "सभी"
      }])
      .select()
      .single();

    if (pollError) throw pollError;

    const uploadedFiles = req.files || [];
    const optionsToInsert = cleanOptions.map((opt, index) => {
      let imgPath = 'https://placehold.co/60x60?text=Leader';
      if (uploadedFiles[index]) {
        imgPath = `/uploads/${uploadedFiles[index].filename}`;
      }
      return {
        poll_id: poll.id,
        text: opt.trim(),
        votes: 0,
        image_url: imgPath
      };
    });

    const { error: optError } = await supabase.from('options').insert(optionsToInsert);
    if (optError) throw optError;

    res.redirect(`/poll/${poll.id}`);
  } catch (err) {
    console.error('Create Poll Error:', err.message);
    res.status(500).send("पोल सेव नहीं हो सका: " + err.message);
  }
});

// 4. सिंगल पोल पेज
app.get('/poll/:id', async (req, res) => {
  try {
    const voterKey = getVoterIdentifier(req, res);
    const pollId = req.params.id;

    const { data: poll, error } = await supabase
      .from('polls')
      .select('*, options(*)')
      .eq('id', pollId)
      .single();

    if (error || !poll) {
      return res.status(404).send("पोल नहीं मिला!");
    }

    const { data: existingVote } = await supabase
      .from('voters')
      .select('id')
      .eq('poll_id', pollId)
      .eq('voter_key', voterKey)
      .maybeSingle();

    const formattedPoll = {
      id: poll.id,
      title: poll.title,
      category: poll.category,
      state: poll.state,
      district: poll.district,
      samiti: poll.samiti,
      totalVotes: poll.total_votes || 0,
      createdAt: new Date(poll.created_at).toLocaleDateString('hi-IN'),
      options: poll.options || []
    };

    const currentUrl = `${req.protocol}://${req.get('host')}/poll/${poll.id}`;

    res.render('poll', { 
      poll: formattedPoll, 
      hasVoted: !!existingVote, 
      currentUrl 
    });
  } catch (err) {
    res.status(404).send("अमान्य लिंक या पोल उपलब्ध नहीं है।");
  }
});

// 5. वोटिंग API
app.post('/api/polls/:id/vote', async (req, res) => {
  try {
    const voterKey = getVoterIdentifier(req, res);
    const { optionId } = req.body;
    const pollId = req.params.id;

    const { data: alreadyVoted } = await supabase
      .from('voters')
      .select('id')
      .eq('poll_id', pollId)
      .eq('voter_key', voterKey)
      .maybeSingle();

    if (alreadyVoted) {
      return res.status(400).json({ success: false, message: "आप पहले ही वोट दे चुके हैं!" });
    }

    // 1. वोटर लॉक करें
    const { error: voterError } = await supabase
      .from('voters')
      .insert([{ poll_id: pollId, voter_key: voterKey }]);

    if (voterError) {
      return res.status(400).json({ success: false, message: "वोट दर्ज नहीं हो सका।" });
    }

    // 2. ऑप्शन वोट बढ़ाएं
    const { data: opt } = await supabase.from('options').select('votes').eq('id', optionId).single();
    await supabase.from('options').update({ votes: (opt ? opt.votes : 0) + 1 }).eq('id', optionId);

    // 3. कुल वोट बढ़ाएं
    const { data: currentPoll } = await supabase.from('polls').select('total_votes').eq('id', pollId).single();
    const updatedTotal = (currentPoll ? currentPoll.total_votes : 0) + 1;
    await supabase.from('polls').update({ total_votes: updatedTotal }).eq('id', pollId);

    const { data: allOptions } = await supabase.from('options').select('*').eq('poll_id', pollId);

    res.json({
      success: true,
      totalVotes: updatedTotal,
      options: allOptions.map(o => ({
        id: o.id,
        text: o.text,
        image_url: o.image_url,
        votes: o.votes,
        percentage: updatedTotal ? ((o.votes / updatedTotal) * 100).toFixed(1) : 0
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "तकनीकी त्रुटि आई।" });
  }
});

app.listen(PORT, () => {
  console.log(`Polling Station सर्वर चालू है: http://localhost:${PORT}`);
});