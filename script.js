document.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            window.poolData = data;

            // Helper to parse availability from string
            function parseAvailability(str) {
                if (typeof str !== 'string' || !str.trim()) return 0;

                // Simplified parsing: since the backend now guarantees a clean string representation of the count,
                // we attempt to parse it directly.
                const num = parseInt(str);

                if (isNaN(num)) {
                    // Fallback for unexpected non-numeric strings (e.g., "available", "N/A")
                    const lowerStr = str.toLowerCase();
                    if (lowerStr.includes('wolne wszystkie')) return 10;
                    if (lowerStr.includes('pływalnia dostępna')) return 5;
                    return 0;
                }

                // Return the numerical value found.
                return num;
            }

            function isNoise(entry) {
                const time = entry.time.toLowerCase();
                const lanes = entry.availableLanes.toLowerCase();
                if (time.includes('dzień') || time.includes('data') || time.includes('godzina')) return true;
                if (lanes.includes('ilość wolnych torów') || lanes.includes('p\rł\ry\rw')) return true;
                if (lanes.trim().length < 3 && !/^[0-9]+$/.test(lanes)) return true; // Checks for pure numbers
                return false;
            }

            function render() {
                const dayFilter = document.getElementById('day-filter').value;
                const poolAvailabilityDiv = document.getElementById('pool-availability');
                const highlightsContainer = document.getElementById('highlights-container');
                poolAvailabilityDiv.innerHTML = '';

                // Aggregate slots into 1-hour buckets
                const hourlyBuckets = [];

                window.poolData.forEach(pool => {
                    // --- Aggregate for Highlights ---
                    const groups = {};
                    pool.schedule.filter(entry => !isNoise(entry))
                        .filter(entry => dayFilter === 'all' || entry.day === dayFilter)
                        .forEach(entry => {
                            const timeMatch = entry.time.match(/(\d+)/);
                            if (!timeMatch) return;
                            const startHour = parseInt(timeMatch[1]);
                            const key = `${entry.day}-${startHour}`;
                            if (!groups[key]) {
                                groups[key] = {
                                    poolName: pool.name,
                                    day: entry.day,
                                    time: `${startHour}:00 - ${startHour + 1}:00`,
                                    totalAvailability: 0,
                                    count: 0
                                };
                            }
                            groups[key].totalAvailability += parseAvailability(entry.availableLanes);
                            groups[key].count++;
                        });

                    Object.values(groups).forEach(g => {
                        hourlyBuckets.push({ ...g, avgAvailability: g.totalAvailability / g.count });
                    });
                });

                // --- Display best pool for each hour ---
                const bestSlotsByHour = {};
                hourlyBuckets.forEach(slot => {
                    const key = `${slot.day}-${slot.time}`;
                    if (!bestSlotsByHour[key] || slot.avgAvailability > bestSlotsByHour[key].avgAvailability) {
                        bestSlotsByHour[key] = slot;
                    }
                });

                const sortedSlots = Object.values(bestSlotsByHour)
                    .sort((a, b) => {
                        const days = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
                        const dayCompare = days.indexOf(a.day) - days.indexOf(b.day);
                        if (dayCompare !== 0) return dayCompare;
                        return parseInt(a.time) - parseInt(b.time);
                    });

                highlightsContainer.innerHTML = sortedSlots.map(slot => `
                    <div class="highlight-card">
                        <strong>${slot.poolName}</strong><br>
                        ${slot.day}<br>
                        ${slot.time}<br>
                        Score: ${slot.avgAvailability.toFixed(1)}
                    </div>
                `).join('');

                // --- Render Tables for all pools ---
                window.poolData.forEach(pool => {
                    const poolSchedule = pool.schedule.filter(entry => !isNoise(entry))
                        .filter(entry => dayFilter === 'all' || entry.day === dayFilter);
                    if (poolSchedule.length > 0) {
                        const poolCard = document.createElement('div');
                        poolCard.classList.add('pool-card');
                        poolCard.innerHTML = \`
                            <h2>\${pool.name}</h2>
                            <table class="schedule-table">
                                <thead><tr><th>Day</th><th>Time</th><th>Available Lanes</th></tr></thead>
                                <tbody>
                                    \${poolSchedule.map(e => \`<tr><td>\${e.day.replace(/\\r/g,'')}</td><td>\${e.time.replace(/\\r/g,'')}</td><td>\${e.availableLanes.replace(/\\r/g,'')}</td></tr>\`).join('')}
                                </tbody>
                            </table>\`;
                        poolAvailabilityDiv.appendChild(poolCard);
                    }
                });
            }

            document.getElementById('day-filter').addEventListener('change', render);
            render();
        })
        .catch(err => console.error("Failed to load or process data:", err));
});