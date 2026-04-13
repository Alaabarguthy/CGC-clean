
import fs from 'fs';
import http from 'http';

const ERP_CONFIG = {
    url: 'http://3.141.83.23:8085/api/call',
    auth: {
        AD_Role_ID: "1000036",
        AD_Client_ID: "1000005",
        EMail: "webservicesuser@art.net",
        Password: "clayoven"
    }
};

const CSV_PATH = 'c:\\Users\\ADMIN\\Desktop\\ARTELCO_Automation\\Artelco_App\\fix_request.csv';

async function executeErpRequest(payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const options = {
            hostname: '3.141.83.23',
            port: 8085,
            path: '/api/call',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(body);
        req.end();
    });
}

function parseCsv(content) {
    const lines = content.trim().split('\n');
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        // Document No is parts[0], Fix is parts[2]
        if (parts.length >= 3 && parts[0].trim() && parts[2].trim()) {
            results.push({
                oldNo: parts[0].trim(),
                newNo: parts[2].trim()
            });
        }
    }
    return results;
}

async function start() {
    try {
        console.log("Reading CSV...");
        const content = fs.readFileSync(CSV_PATH, 'utf-8');
        const rows = parseCsv(content);

        const total = rows.length;
        console.log(`Found ${total} rows. Starting full update...`);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < total; i++) {
            const row = rows[i];

            const payload = {
                "login_user": ERP_CONFIG.auth,
                "tablename": "R_Request",
                "type": "update_data",
                "columns": [
                    { "name": "DocumentNo", "opertor": "=", "value": row.newNo }
                ],
                "columns_where": [
                    { "name": "DocumentNo", "opertor": "=", "value": row.oldNo }
                ]
            };

            try {
                const result = await executeErpRequest(payload);
                const check = Array.isArray(result) ? result[0] : result;

                if (check && check.massage === "Record Updated") {
                    successCount++;
                } else {
                    console.warn(`[Row ${i + 1}] Unexpected result for ${row.oldNo}:`, result);
                    errorCount++;
                }
            } catch (err) {
                console.error(`[Row ${i + 1}] Error updating ${row.oldNo}:`, err.message);
                errorCount++;
            }

            // Progress reporting every 100 rows
            if ((i + 1) % 100 === 0 || (i + 1) === total) {
                const percent = (((i + 1) / total) * 100).toFixed(1);
                console.log(`Progress: ${i + 1}/${total} (${percent}%) | Success: ${successCount} | Errors: ${errorCount}`);
            }
        }

        console.log("========================================");
        console.log("Update Complete.");
        console.log(`Total Rows Processed: ${total}`);
        console.log(`Successfully Updated: ${successCount}`);
        console.log(`Errors/Skipped: ${errorCount}`);
        console.log("========================================");
    } catch (e) {
        console.error("FATAL ERROR:", e);
    }
}

start();
