from pydantic import BaseModel, Field
from datetime import datetime

class LocationSample(BaseModel):
    latitude: float
    longitude: float
    timestamp: datetime


class LocationSequence(BaseModel):
    samples: list[LocationSample] = Field(min_length=31, max_length=31)
    
class Coordinate(BaseModel):
    lat: float
    long: float

class GeofencePing(BaseModel):
    lat: float
    long: float
    timestamp: datetime
    caution_zone_coords: list[Coordinate]
    danger_zone_coords: list[Coordinate]