const OpenAI = require('openai');
const Song = require('../models/song');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const getSongInfoFromAI = async (title, retryCount = 0) => {
    try {
        console.log(`🔄 Getting AI analysis for title: "${title}"`);
        const prompt = `Extract song information from this YouTube video title and return it as a JSON object: "${title}"

        Context: This is a YouTube video title that may contain additional information like duration, "Official Video", etc. Please extract just the song information.

        Rules:
        1. Remove any time stamps (e.g., "3:45", "▶ 4:48")
        2. Remove words like "Reproduciendo", "Official Video", "Visualizer", "En Vivo", "Live"
        3. If multiple artists are featured, use the main artist
        4. For release year:
           - If year is in title, use it
           - If not, estimate based on the song's original release (not a re-release or live version)
           - Default to 2000 if uncertain
        5. For album:
           - If album name is in title, use it
           - If not, use "Unknown Album"

        Required fields:
        - name: The song name without any extra information
        - release_year: The year as a number (e.g., 1985)
        - artist: The main artist's name
        - album: The album name or "Unknown Album"

        Return format:
        {
            "name": "song name",
            "release_year": year,
            "artist": "artist name",
            "album": "album name"
        }

        Example:
        Input: "3:45 ▶ Artist Name - Song Title (Official Video) ft. Other Artist"
        Output: {
            "name": "Song Title",
            "release_year": 2000,
            "artist": "Artist Name",
            "album": "Unknown Album"
        }`;

        console.log('🔄 Sending request to OpenAI...');
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
            });

            const response = completion.choices[0].message.content;
            console.log('✅ Received AI response:', response);
            
            const parsedResponse = JSON.parse(response);
            console.log('✅ Successfully parsed AI response');

            // Add delay between requests to avoid rate limits
            await delay(100);

            return parsedResponse;
        } catch (error) {
            if (error.code === 'rate_limit_exceeded') {
                if (retryCount < 3) {
                    console.log(`Rate limit hit, retrying in ${(retryCount + 1) * 1000}ms...`);
                    await delay((retryCount + 1) * 1000);
                    return getSongInfoFromAI(title, retryCount + 1);
                }
                throw new Error('Rate limit exceeded after 3 retries');
            }
            throw error;
        }

    } catch (error) {
        console.error('❌ Error getting song info from AI:', error);
        if (error instanceof SyntaxError) {
            console.error('Invalid JSON response from AI');
            throw new Error('Failed to parse AI response');
        }
        throw new Error(`AI analysis failed: ${error.message}`);
    }
};

exports.processPlaylist = async (req, res) => {
    try {
        console.log('🎵 Starting playlist processing...');
        const playlist = req.body;

        if (!playlist || !Array.isArray(playlist)) {
            console.warn('❌ No playlist array provided');
            return res.status(400).json({ error: 'Playlist array is required' });
        }

        console.log(`✅ Found ${playlist.length} videos in playlist`);

        const songs = [];
        let successCount = 0;
        let errorCount = 0;

        for (const [index, video] of playlist.entries()) {
            try {
                console.log(`\n🎵 Processing video ${index + 1}/${playlist.length}`);
                console.log(`Title: ${video.title}`);
                console.log(`URL: ${video.youtube_video_link}`);

                const songInfo = await getSongInfoFromAI(video.title);
                const songData = {
                    ...songInfo,
                    link_or_file: video.youtube_video_link
                };

                console.log('🔄 Saving song to database:', songData);
                const song = new Song(songData);
                await song.save();
                console.log('✅ Song saved successfully');

                songs.push(songData);
                successCount++;
            } catch (error) {
                console.error(`❌ Error processing video ${index + 1}:`, error);
                errorCount++;
            }
        }

        console.log('\n📊 Processing Summary:');
        console.log(`Total videos: ${playlist.length}`);
        console.log(`Successfully processed: ${successCount}`);
        console.log(`Failed to process: ${errorCount}`);

        res.json({
            message: 'Playlist processing completed',
            total: playlist.length,
            successful: successCount,
            failed: errorCount,
            songs
        });
    } catch (error) {
        console.error('❌ Fatal error processing playlist:', error);
        res.status(500).json({
            error: 'Error processing playlist',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
