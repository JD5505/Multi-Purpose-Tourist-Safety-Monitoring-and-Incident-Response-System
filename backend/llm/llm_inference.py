from llm.initialization import llm_chain

def get_response(model_output, location_data, lat, long, timestamp, caution_zone_coords, danger_zone_coords):
    response = llm_chain.invoke(
        f"""
        input:
        gru_autoencoder_output(ignore if None): {model_output},
        users_trajectory_data: {location_data},
        user's current location: {lat, long},
        anomaly time: {timestamp},
        caution_zone_coords: {caution_zone_coords},
        danger_zone_coords: {danger_zone_coords}
        """
    )
    return response