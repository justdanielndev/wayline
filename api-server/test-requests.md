# Test Requests for Transitland API Integration

## 1. Get Stops Near a Location
```bash
# Get stops near Valencia city center
curl "http://localhost:3000/api/stops?lat=39.4699&lon=-0.3763&radius=1000"
```

## 2. Get Transport Data (Routes and Stops)
```bash
# Get transport data near Valencia
curl "http://localhost:3000/api/transport?lat=39.4699&lon=-0.3763&radius=500"
```

## 3. Get Real-time Departures
```bash
# Get departures for a specific stop (example: EMT Valencia stop)
curl "http://localhost:3000/api/departures-realtime?stop_id=YOUR_STOP_ID&feed_onestop_id=f-ezp8-emtvalencia"

# Get departures for a Metrovalencia stop
curl "http://localhost:3000/api/departures-realtime?stop_id=YOUR_STOP_ID&feed_onestop_id=f-metro~de~valencia"
```

## 4. Get Routes
```bash
# Get all routes (shows only providers with showlines=true)
curl "http://localhost:3000/api/routes?lat=39.4699&lon=-0.3763&radius=5000"
```

## 5. Update Database with Latest Data
```bash
# Run the fetch script to update MongoDB with latest Transitland data
cd /Users/koru/wayline/api-server
npm run fetch-gtfs
```

## Notes:
- The API now uses Transitland exclusively for GTFS data
- Bike stations (Valenbisi, JCDecaux) continue to use their specific APIs
- Only providers with `dbstored: true` in available_providers.json will be cached in MongoDB
- Departures are always fetched in real-time from Transitland (with 2-hour cache)
- Replace `YOUR_STOP_ID` with actual stop IDs from your database or Transitland

## Example Response Formats:

### Stops Response:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-0.3763, 39.4699]
      },
      "properties": {
        "stop_id": "STOP123",
        "stop_name": "Example Stop",
        "feed_onestop_id": "f-ezp8-emtvalencia",
        "feed_name": "EMT Valencia",
        "routes": [
          {
            "route_short_name": "10",
            "route_color": "#FF0000",
            "route_type": 3,
            "feed_onestop_id": "f-ezp8-emtvalencia"
          }
        ],
        "distance": 150
      }
    }
  ]
}
```

### Departures Response:
```json
{
  "stop_name": "Example Stop",
  "stop_id": "STOP123",
  "feed_onestop_id": "f-ezp8-emtvalencia",
  "current_time": "2024-01-15T10:30:00Z",
  "server_time": 1705318200000,
  "departures": {
    "past": [],
    "upcoming": [
      {
        "departure_time": "10:35:00",
        "arrival_time": "10:35:00",
        "route": {
          "route_id": "10",
          "route_short_name": "10",
          "route_long_name": "Hospital - Malvarrosa",
          "route_color": "#FF0000",
          "route_type": 3,
          "feed_onestop_id": "f-ezp8-emtvalencia"
        },
        "trip_id": "TRIP123",
        "trip_headsign": "Malvarrosa",
        "stop_sequence": 5,
        "minutes_from_now": 5,
        "realtime": false,
        "service_date": "2024-01-15",
        "schedule_relationship": "STATIC"
      }
    ],
    "later": []
  },
  "cached": false
}
```