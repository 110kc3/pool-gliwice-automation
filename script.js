document.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            const poolAvailabilityDiv = document.getElementById('pool-availability');
            poolAvailabilityDiv.innerHTML = ''; // Clear loading message

            data.forEach(pool => {
                const poolCard = document.createElement('div');
                poolCard.classList.add('pool-card');

                const poolName = document.createElement('h2');
                poolName.textContent = pool.name;
                poolCard.appendChild(poolName);

                const scheduleTable = document.createElement('table');
                scheduleTable.classList.add('schedule-table');
                scheduleTable.innerHTML = `
                    <thead>
                        <tr>
                            <th>Day</th>
                            <th>Time</th>
                            <th>Available Lanes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pool.schedule.map(entry => `
                            <tr>
                                <td>${entry.day}</td>
                                <td>${entry.time}</td>
                                <td>${entry.availableLanes}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                `;
                poolCard.appendChild(scheduleTable);
                poolAvailabilityDiv.appendChild(poolCard);
            });
        })
        .catch(error => console.error('Error fetching pool data:', error));
});