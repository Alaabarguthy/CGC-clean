
const ERP_URL = 'http://3.141.83.23:8085/api/call';
const AUTH = {
    AD_Role_ID: "1000036",
    AD_Client_ID: "1000005",
    EMail: "webservicesuser@art.net",
    Password: "clayoven"
};

async function runFix() {
    console.log("--- Starting Overtime History Fix Script ---");
    
    // 1. Get all updates with overtime
    const queryPayload = {
        login_user: AUTH,
        tablename: "R_RequestUpdate",
        type: "query_data",
        columns_where: [
            { name: "HoursOvertime", opertor: ">", value: "0" }
        ],
        record_count: 5000,
        columns_output: ["R_RequestUpdate_ID", "HoursOvertime", "QtyInvoiced", "Created"]
    };

    try {
        console.log("Fetching pending overtime updates...");
        const response = await fetch(ERP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queryPayload)
        });
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            console.error("Error fetching data:", data);
            return;
        }

        // 2. Filter only those that need fixing (QtyInvoiced != HoursOvertime)
        const toFix = data.filter(u => parseFloat(u.QtyInvoiced || 0) !== parseFloat(u.HoursOvertime));
        
        console.log(`Found ${data.length} total updates with overtime.`);
        console.log(`Found ${toFix.length} updates that need archiving (QtyInvoiced mismatch).`);

        if (toFix.length === 0) {
            console.log("Nothing to fix! Exiting.");
            return;
        }

        // 3. Loop and Update
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < toFix.length; i++) {
            const upd = toFix[i];
            const updatePayload = {
                login_user: AUTH,
                tablename: "R_RequestUpdate",
                type: "update_data",
                columns: [
                    { name: "QtyInvoiced", opertor: "=", value: String(upd.HoursOvertime) }
                ],
                columns_where: [
                    { name: "R_RequestUpdate_ID", opertor: "=", value: String(upd.R_RequestUpdate_ID) }
                ]
            };

            process.stdout.write(`Processing ${i + 1}/${toFix.length} (ID: ${upd.R_RequestUpdate_ID})... `);

            const upRes = await fetch(ERP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatePayload)
            });

            const resData = await upRes.json();
            const resObj = Array.isArray(resData) ? resData[0] : resData;

            if (resObj && (resObj.massage === "Record Updated" || resObj.Value || resObj.RECORDID)) {
                console.log("✅ Fixed");
                successCount++;
            } else {
                console.log("❌ Failed", resData);
                failCount++;
            }
            
            // Subtle delay to prevent flooding
            await new Promise(r => setTimeout(r, 100));
        }

        console.log("\n--- Fix Completed ---");
        console.log(`Successfully Fixed: ${successCount}`);
        console.log(`Failed: ${failCount}`);

    } catch (e) {
        console.error("Critical Error during fix execution:", e);
    }
}

runFix();
