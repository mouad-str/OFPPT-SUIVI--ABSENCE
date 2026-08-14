import api from './api';

export const studentPortalService = {
    lookup: async (numInscription) => {
        const response = await api.post('/student/lookup', { numInscription });
        return response.data;
    },

    submitJustification: async (formData) => {
        const response = await api.post('/student/justify', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    }
};

export default studentPortalService;
