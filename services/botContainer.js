module.exports = function buildBotContainer(models){
    return {
        Message: models.Message,
        Flow: models.Flow,
        PaymentWaiting: models.PaymentWaiting,
        UserStatus: models.UserStatus,
        enviarWhatsApp: models.enviarWhatsApp,
        processSequence: models.processSequence
    };
};