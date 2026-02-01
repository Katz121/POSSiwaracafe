import https from 'https';

const apiKey = 'AIzaSyAkZHmtXKINXKquCkTeZcxk645I-yHRFec';

async function listModels() {
    return new Promise((resolve) => {
        console.log('Querying available models...');
        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models?key=${apiKey}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseBody);
                    if (parsed.error) {
                        console.log(`❌ ListModels Failed: ${parsed.error.message}`);
                    } else if (parsed.models) {
                        console.log('✅ Available Models:');
                        parsed.models.forEach(m => {
                            if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                                console.log(`- ${m.name} (Supports generateContent)`);
                            } else {
                                console.log(`- ${m.name} (No generateContent support)`);
                            }
                        });
                    } else {
                        console.log('⚠️ No models returned.', parsed);
                    }
                } catch (e) {
                    console.log('❌ Parse Error');
                }
                resolve();
            });
        });

        req.on('error', (error) => {
            console.error(`❌ Network Error - ${error.message}`);
            resolve();
        });

        req.end();
    });
}

listModels();
